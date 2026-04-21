const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const { calculateXP, determineRank } = require("./rankingXP.js");   //From rankingXP

const app = express();

app.use(express.static("frontend"));
app.use(bodyParser.json());

const db = new sqlite3.Database("./users.db");

// Create user table if it doesn't exist
db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    major TEXT,
    xp INTEGER DEFAULT 0,
    rank TEXT DEFAULT 'Bronze'
)`);

// SIGNUP
app.post("/signup", async (req, res) => {
    const { username, password, major } = req.body;

    if (!username || !password || !major) {
        return res.status(400).send("All fields required");
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        db.run(
            "INSERT INTO users (username, password, major) VALUES (?, ?, ?)",
            [username, hashedPassword, major],
            function(err) {
                if (err) {
                    res.status(400).send("User already exists");
                } else {
                    res.send("User created");
                }
            }
        );
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

// LOGIN
// app.post("/login", (req, res) => {
//     const { username, password } = req.body;

//     db.get(
//         "SELECT * FROM users WHERE username = ?",
//         [username],
//         async (err, user) => {
//             if (!user) {
//                 return res.status(400).send("User not found");
//             }

//             const match = await bcrypt.compare(password, user.password);

//             if (match) {
//                 res.send("Login successful");
//             } else {
//                 res.status(401).send("Invalid password");
//             }
//         }
//     );
// });

app.post("/login", (req, res) => {
    const { username, password } = req.body;

    db.get(
        "SELECT * FROM users WHERE username = ?",
        [username],
        async (err, user) => {

            if (!user) {
                return res.status(400).send("User not found");
            }

            const match = await bcrypt.compare(password, user.password);

            if (match) {
                res.json({
                    message: "Login successful",
                    username: user.username,
                    major: user.major
                });
            } else {
                res.status(401).send("Invalid password");
            }
        }
    );
});

//Create question Table if it doesn't exist
//difficulty should be either easy, medium or hard
//category should be the subject
db.run(`CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT,
    answer TEXT,
    difficulty TEXT,
    category TEXT
)`);

//Add question to the database
app.post("/add-question", (req, res) => {
    const { question, answer, difficulty, category } = req.body;

    if (!question || !answer || !difficulty || !category) {
        return res.status(400).send("All fields required");
    }

    db.run(
        "INSERT INTO questions (question, answer, difficulty, category) VALUES (?, ?, ?, ?)",
        [question, answer, difficulty, category],
        function(err) {
            if (err) {
                res.status(500).send("Error adding question");
            } else {
                res.send("Question added");
            }
        }
    );
});

app.get("/questions", (req, res) => {
    db.all("SELECT * FROM questions", [], (err, rows) => {
        if (err) {
            return res.status(500).send("Error getting questions");
        }
        res.json(rows);
    });
});

//Ranking Storage and checks if the user's answer is right,
//calculates their new stats, and saves it to the database.
app.post("/answer-question", (req, res) => {
    const { username, questionId, answer } = req.body;

    if (!username || !questionId || !answer) {
        return res.status(400).send("Missing fields");
    }

    // 1. Get question from database
    db.get(
        "SELECT * FROM questions WHERE id = ?",
        [questionId],
        (err, question) => {

            if (!question) {
                return res.status(404).send("Question not found");
            }

            // 2. Check if answer is correct
            const isCorrect =
                question.answer.trim().toLowerCase() === answer.trim().toLowerCase();

            if (!isCorrect) {
                return res.json({
                    correct: false,
                    message: "Wrong answer 😢"
                });
            }

            // 3. Get user data
            db.get(
                "SELECT * FROM users WHERE username = ?",
                [username],
                (err, user) => {

                    if (!user) {
                        return res.status(404).send("User not found");
                    }

                    // 4. Calculate XP
                    const xpGained = calculateXP(question.difficulty);
                    const newXP = user.xp + xpGained;
                    const newRank = determineRank(newXP);

                    // 5. Update user in database
                    db.run(
                        "UPDATE users SET xp = ?, rank = ? WHERE username = ?",
                        [newXP, newRank, username],
                        function(err) {

                            if (err) {
                                return res.status(500).send("Error updating user");
                            }

                            // 6. Send response back to frontend
                            res.json({
                                correct: true,
                                xpGained: xpGained,
                                totalXP: newXP,
                                rank: newRank
                            });
                        }
                    );
                }
            );
        }
    );
});

//Challenging System: Answer cross-guild challenges
//DataBase for challenge questions
db.run(`CREATE TABLE IF NOT EXISTS challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenger_username TEXT,
    challenger_major TEXT,
    question_id INTEGER,
    status TEXT DEFAULT 'pending'
)`);

//Section on creating challenging question 
app.post("/create-challenge", (req, res) => {
    const { challenger_username, challenger_major, question_id } = req.body;

    if (!challenger_username || !challenger_major || !question_id) {
        return res.status(400).send("Missing required fields to create a challenge.");
    }

    // Verify the question actually exists
    db.get("SELECT id FROM questions WHERE id = ?", [question_id], (err, question) => {
        if (err || !question) return res.status(404).send("Question not found.");

        db.run(
            "INSERT INTO challenges (challenger_username, challenger_major, question_id) VALUES (?, ?, ?)",
            [challenger_username, challenger_major, question_id],
            function(err) {
                if (err) return res.status(500).send("Error creating challenge.");
                res.json({ message: "Global challenge created successfully!", challengeId: this.lastID });
            }
        );
    });
});

//This is to see what challenge question are avalable
app.get("/challenges/:myMajor", (req, res) => {
    const myMajor = req.params.myMajor;

    // Fetch all pending challenges EXCEPT the ones created by the same guild
    const query = `
        SELECT c.id AS challenge_id, c.challenger_username, c.challenger_major, q.question, q.difficulty, q.category 
        FROM challenges c
        JOIN questions q ON c.question_id = q.id
        WHERE c.challenger_major != ? AND c.status = 'pending'
    `;

    db.all(query, [myMajor], (err, rows) => {
        if (err) {
            return res.status(500).send("Error retrieving challenges.");
        }
        res.json(rows);
    });
});

//Doing the Challenge question and checking answers (very simailer to normal questions)
app.post("/answer-challenge", (req, res) => {
    const { challenge_id, username, answer } = req.body;

    if (!challenge_id || !username || !answer) {
        return res.status(400).send("Missing fields.");
    }

    db.get("SELECT * FROM challenges WHERE id = ? AND status = 'pending'", [challenge_id], (err, challenge) => {
        if (err || !challenge) return res.status(404).send("Challenge not found or already completed.");

        db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
            if (err || !user) return res.status(404).send("User not found.");

            // CHECK: You can't answer your own guild's challenge
            if (user.major === challenge.challenger_major) {
                return res.status(403).send("You cannot answer a challenge issued by your own guild, silly!");
            }

            db.get("SELECT * FROM questions WHERE id = ?", [challenge.question_id], (err, question) => {
                if (err || !question) return res.status(404).send("Question not found.");

                const isCorrect = question.answer.trim().toLowerCase() === answer.trim().toLowerCase();

                if (!isCorrect) {
                    return res.json({ correct: false, message: "Wrong answer to the challenge!" });
                }

                db.run("UPDATE challenges SET status = 'completed' WHERE id = ?", [challenge_id], (err) => {
                    if (err) return res.status(500).send("Error updating challenge status.");

                    // Award XP (1.5x bonus for doing a Challenge question )
                    const baseXP = calculateXP(question.difficulty);
                    const totalXPGained = Math.floor(baseXP * 1.5); 
                    const newXP = user.xp + totalXPGained;
                    const newRank = determineRank(newXP);

                    db.run(
                        "UPDATE users SET xp = ?, rank = ? WHERE username = ?",
                        [newXP, newRank, username],
                        (err) => {
                            if (err) return res.status(500).send("Error updating user stats.");

                            res.json({
                                correct: true,
                                message: `Challenge Completed! You defeated a ${challenge.difficulty} challenge from the ${challenge.challenger_major} guild.`,
                                xpGained: totalXPGained,
                                totalXP: newXP,
                                rank: newRank
                            });
                        }
                    );
                });
            });
        });
    });
});

// GET leaderboard (sorted by XP)
app.get("/leaderboard", (req, res) => {
    db.all(
        "SELECT username, major, xp, rank FROM users ORDER BY xp DESC",
        [],
        (err, rows) => {

            if (err) {
                console.error(err);
                return res.status(500).json({ error: "Error retrieving leaderboard" });
            }

            res.json(rows);
        }
    );
});


db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    guild TEXT,
    message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

app.post("/send-message", (req, res) => {
    const { username, guild, message } = req.body;

    if (!username || !guild || !message) {
        return res.status(400).send("Missing fields");
    }

    db.run(
        "INSERT INTO messages (username, guild, message) VALUES (?, ?, ?)",
        [username, guild, message],
        function(err) {
            if (err) {
                return res.status(500).send("Error sending message");
            }
            res.send("Message sent");
        }
    );
});

app.get("/messages/:guild", (req, res) => {
    const guild = req.params.guild;

    db.all(
        "SELECT * FROM messages WHERE guild = ? ORDER BY timestamp ASC",
        [guild],
        (err, rows) => {
            if (err) {
                return res.status(500).send("Error retrieving messages");
            }
            res.json(rows);
        }
    );
});

app.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});