const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const { calculateXP, determineRank } = require("./rankingXP.js");

const app = express();
const db = new sqlite3.Database("./users.db");

// --- MIDDLEWARE & STATIC FILES ---
app.use(express.static("frontend"));
app.use(bodyParser.json());

// --- DATABASE INITIALIZATION ---
// Initialize all tables at startup
db.serialize(() => {
    // User accounts and stats
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        major TEXT,
        xp INTEGER DEFAULT 0,
        rank TEXT DEFAULT 'Bronze'
    )`);

    // Chat reactions
    db.run(`CREATE TABLE IF NOT EXISTS reactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER,
        username TEXT,
        emoji TEXT
    )`);

    // Track online status
    db.run(`CREATE TABLE IF NOT EXISTS active_users (
        username TEXT PRIMARY KEY,
        guild TEXT,
        last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
        room TEXT DEFAULT 'global'
    )`);

    // Question bank
    db.run(`CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question TEXT,
        answer TEXT,
        difficulty TEXT,
        category TEXT
    )`);

    // Guild challenges
    db.run(`CREATE TABLE IF NOT EXISTS challenges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        challenger_username TEXT,
        challenger_major TEXT,
        question_id INTEGER,
        status TEXT DEFAULT 'pending'
    )`);

    // Chat history
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        guild TEXT,
        message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        room TEXT DEFAULT 'global'
    )`);
});

// --- AUTHENTICATION ROUTES ---

// Handle new user registration
app.post("/signup", async (req, res) => {
    const { username, password, major } = req.body;
    if (!username || !password || !major) return res.status(400).send("All fields required");

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(
            "INSERT INTO users (username, password, major) VALUES (?, ?, ?)",
            [username, hashedPassword, major],
            function (err) {
                if (err) return res.status(400).send("User already exists");
                res.send("User created");
            }
        );
    } catch (error) {
        res.status(500).send("Server error");
    }
});

// Handle user login
app.post("/login", (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
        if (!user) return res.status(400).json({ message: "User not found" });

        const match = await bcrypt.compare(password, user.password);
        if (match) {
            res.json({
                message: "Login successful",
                username: user.username,
                major: user.major
            });
        } else {
            res.status(401).json({ message: "Invalid password" });
        }
    });
});

// --- USER PRESENCE (HEARTBEAT) ---

// Updates user's "last active" timestamp to keep them online
app.post("/heartbeat", (req, res) => {
    const { username, guild, room } = req.body;
    db.run(
        `INSERT OR REPLACE INTO active_users (username, guild, room, last_active) 
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        [username, guild, room],
        (err) => {
            if (err) return res.status(500).send("Error");
            res.sendStatus(200);
        }
    );
});

// Cleanup: Remove users who haven't sent a heartbeat in 15 seconds
setInterval(() => {
    db.run("DELETE FROM active_users WHERE last_active < datetime('now', '-15 seconds')");
}, 5000);

// Get list of users currently in a specific room
app.get("/active-users/:room", (req, res) => {
    db.all("SELECT username FROM active_users WHERE room = ?", [req.params.room], (err, rows) => {
        if (err) return res.status(500).json([]);
        res.json(rows);
    });
});

// Explicitly set user as offline
app.post("/go-offline", (req, res) => {
    const { username } = req.body;
    db.run("DELETE FROM active_users WHERE username = ?", [username], (err) => {
        if (err) return res.status(500).send("Error");
        res.sendStatus(200);
    });
});

// --- QUESTION & XP LOGIC ---

// Admin/System: Add a question to the pool
app.post("/add-question", (req, res) => {
    const { question, answer, difficulty, category } = req.body;
    if (!question || !answer || !difficulty || !category) return res.status(400).send("All fields required");

    db.run(
        "INSERT INTO questions (question, answer, difficulty, category) VALUES (?, ?, ?, ?)",
        [question, answer, difficulty, category],
        (err) => {
            if (err) return res.status(500).send("Error adding question");
            res.send("Question added");
        }
    );
});

// Get all available questions
app.get("/questions", (req, res) => {
    db.all("SELECT * FROM questions", [], (err, rows) => {
        if (err) return res.status(500).send("Error getting questions");
        res.json(rows);
    });
});

// Check answer, update XP, and update Rank
app.post("/answer-question", (req, res) => {
    const { username, questionId, answer } = req.body;
    if (!username || !questionId || !answer) return res.status(400).send("Missing fields");

    db.get("SELECT * FROM questions WHERE id = ?", [questionId], (err, question) => {
        if (!question) return res.status(404).send("Question not found");

        const isCorrect = question.answer.trim().toLowerCase() === answer.trim().toLowerCase();
        if (!isCorrect) return res.json({ correct: false, message: "Wrong answer 😢" });

        db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
            if (!user) return res.status(404).send("User not found");

            const xpGained = calculateXP(question.difficulty);
            const newXP = user.xp + xpGained;
            const newRank = determineRank(newXP);

            db.run(
                "UPDATE users SET xp = ?, rank = ? WHERE username = ?",
                [newXP, newRank, username],
                (err) => {
                    if (err) return res.status(500).send("Error updating user");
                    res.json({
                        correct: true,
                        xpGained: xpGained,
                        totalXP: newXP,
                        rank: newRank
                    });
                }
            );
        });
    });
});

// --- CHALLENGE SYSTEM ---

// Create a challenge for other guilds to solve
app.post("/create-challenge", (req, res) => {
    const { challenger_username, challenger_major, question_id } = req.body;
    if (!challenger_username || !challenger_major || !question_id) return res.status(400).send("Missing fields.");

    db.get("SELECT id FROM questions WHERE id = ?", [question_id], (err, question) => {
        if (err || !question) return res.status(404).send("Question not found.");
        db.run(
            "INSERT INTO challenges (challenger_username, challenger_major, question_id) VALUES (?, ?, ?)",
            [challenger_username, challenger_major, question_id],
            function (err) {
                if (err) return res.status(500).send("Error creating challenge.");
                res.json({ message: "Global challenge created successfully!", challengeId: this.lastID });
            }
        );
    });
});

// Get challenges created by guilds other than the user's own
app.get("/challenges/:myMajor", (req, res) => {
    const query = `
        SELECT c.id AS challenge_id, c.challenger_username, c.challenger_major, q.question, q.difficulty, q.category 
        FROM challenges c
        JOIN questions q ON c.question_id = q.id
        WHERE c.challenger_major != ? AND c.status = 'pending'
    `;
    db.all(query, [req.params.myMajor], (err, rows) => {
        if (err) return res.status(500).send("Error retrieving challenges.");
        res.json(rows);
    });
});

// Solve a challenge and earn 1.5x bonus XP
app.post("/answer-challenge", (req, res) => {
    const { challenge_id, username, answer } = req.body;
    if (!challenge_id || !username || !answer) return res.status(400).send("Missing fields.");

    db.get("SELECT * FROM challenges WHERE id = ? AND status = 'pending'", [challenge_id], (err, challenge) => {
        if (err || !challenge) return res.status(404).send("Challenge not found or already completed.");

        db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
            if (err || !user) return res.status(404).send("User not found.");
            if (user.major === challenge.challenger_major) return res.status(403).send("You cannot answer a challenge issued by your own guild, silly!");

            db.get("SELECT * FROM questions WHERE id = ?", [challenge.question_id], (err, question) => {
                const isCorrect = question.answer.trim().toLowerCase() === answer.trim().toLowerCase();
                if (!isCorrect) return res.json({ correct: false, message: "Wrong answer to the challenge!" });

                db.run("UPDATE challenges SET status = 'completed' WHERE id = ?", [challenge_id], () => {
                    const baseXP = calculateXP(question.difficulty);
                    const totalXPGained = Math.floor(baseXP * 1.5);
                    const newXP = user.xp + totalXPGained;
                    const newRank = determineRank(newXP);

                    db.run("UPDATE users SET xp = ?, rank = ? WHERE username = ?", [newXP, newRank, username], (err) => {
                        if (err) return res.status(500).send("Error updating stats.");
                        res.json({
                            correct: true,
                            message: `Challenge Completed! You defeated a ${challenge.difficulty} challenge from the ${challenge.challenger_major} guild.`,
                            xpGained: totalXPGained,
                            totalXP: newXP,
                            rank: newRank
                        });
                    });
                });
            });
        });
    });
});

// --- LEADERBOARD ---

app.get("/leaderboard", (req, res) => {
    db.all("SELECT username, major, xp, rank FROM users ORDER BY xp DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: "Error retrieving leaderboard" });
        res.json(rows);
    });
});

// --- MESSAGING & REACTIONS ---

// Send a message and auto-clean messages older than 2 months
app.post("/send-message", (req, res) => {
    const { username, room, message } = req.body;
    db.run(`DELETE FROM messages WHERE timestamp <= datetime('now', '-2 months')`);

    db.run(
        "INSERT INTO messages (username, room, message) VALUES (?, ?, ?)",
        [username, room, message],
        (err) => {
            if (err) return res.status(500).send("Error sending message");
            res.send("Message sent");
        }
    );
});

// Get messages for a room combined with their reaction data
app.get("/messages/:room", (req, res) => {
    const room = req.params.room;
    db.all("SELECT * FROM messages WHERE room = ? ORDER BY timestamp ASC", [room], (err, messages) => {
        if (err) return res.status(500).json({ error: "Error" });

        db.all("SELECT * FROM reactions", [], (err, reactions) => {
            const messagesWithReactions = messages.map(msg => {
                const msgReactions = reactions.filter(r => r.message_id === msg.id);
                const grouped = msgReactions.reduce((acc, r) => {
                    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, users: [] };
                    acc[r.emoji].count++;
                    acc[r.emoji].users.push(r.username);
                    return acc;
                }, {});
                return { ...msg, reactionData: grouped };
            });
            res.json(messagesWithReactions);
        });
    });
});

// Toggle a reaction (Add if not exists, Remove if it does)
app.post("/toggle-reaction", (req, res) => {
    const { messageId, username, emoji } = req.body;
    const checkQuery = "SELECT id FROM reactions WHERE message_id = ? AND username = ? AND emoji = ?";

    db.get(checkQuery, [messageId, username, emoji], (err, row) => {
        if (row) {
            db.run("DELETE FROM reactions WHERE id = ?", [row.id], () => res.send("Removed"));
        } else {
            db.run("INSERT INTO reactions (message_id, username, emoji) VALUES (?, ?, ?)", [messageId, username, emoji], () => res.send("Added"));
        }
    });
});

// Delete a specific message (Only if it belongs to the user)
app.post("/delete-message", (req, res) => {
    const { messageId, username } = req.body;
    db.run(
        "DELETE FROM messages WHERE id = ? AND username = ?",
        [messageId, username],
        function (err) {
            if (err) return res.status(500).send("Error deleting");
            if (this.changes === 0) return res.status(403).send("Unauthorized");
            res.send("Message deleted");
        }
    );
});

// --- START SERVER ---
app.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});