// --- QUESTION & XP LOGIC ---

const express = require("express");
const db = require("./database");   // retriving from database.js
const { calculateXP, determineRank } = require("./rankingXP.js"); // retriving from rankingXP.js

const router = express.Router();    // Creates a "mini-app" to group related routes

// Add a question to the pool
router.post("/add-question", (req, res) => {
    const { question, answer, difficulty, category, username } = req.body;

    if (!question || !answer || !difficulty || !category || !username) {
        return res.status(400).send("All fields required");
    }

    // Convert username → user_id
    db.get("SELECT id FROM users WHERE username = ?", [username], (err, user) => {
        if (err || !user) return res.status(404).send("User not found");

        db.run(
            "INSERT INTO questions (question, answer, difficulty, category, user_id) VALUES (?, ?, ?, ?, ?)",
            [question, answer, difficulty, category, user.id],
            (err) => {
                if (err) return res.status(500).send("Error adding question");
                res.send("Question added");
            }
        );
    });
});

// Get available questions
router.get("/questions", (req, res) => {
    const { username, category, difficulty, major } = req.query;

    let query = `
        SELECT q.*, u.username, u.major
        FROM questions q
        JOIN users u ON q.user_id = u.id
        WHERE q.id NOT IN (
            SELECT question_id FROM user_correct_answers WHERE username = ?
        )
        AND q.user_id != (SELECT id FROM users WHERE username = ?)
    `;

    const params = [username || "", username || ""];

    // Optional Filters
    if (category) {
        query += " AND category = ?";
        params.push(category);
    }
    if (difficulty) {
        query += " AND difficulty = ?";
        params.push(difficulty);
    }
    if (major) {
        query += " AND u.major = ?";
        params.push(major);
    }

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).send("Error getting questions");
        res.json(rows);
    });
});

// Check answer, update XP, and update rank
router.post("/answer-question", (req, res) => {
    const { username, questionId, answer } = req.body;
    if (!username || !questionId || !answer) return res.status(400).send("Missing fields");

    db.get("SELECT * FROM questions WHERE id = ?", [questionId], (err, question) => {
        if (!question) return res.status(404).send("Question not found");

        const isCorrect = question.answer.trim().toLowerCase() === answer.trim().toLowerCase();

        // Allow retries if wrong
        if (!isCorrect) {
            return res.json({ correct: false, message: "Wrong answer (You can try again!)" });
        }

        // This checks if user answered this correctly
        db.get(
            "SELECT 1 FROM user_correct_answers WHERE username = ? AND question_id = ?",
            [username, questionId],
            (err, row) => {
                if (row) {
                    return res.json({
                        correct: false,
                        message: "You've already answered this correctly. No XP awarded."
                    });
                }

                // If first time answering correctly, reward XP
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

                            // Record the correct answer
                            db.run(
                                "INSERT INTO user_correct_answers (username, question_id) VALUES (?, ?)",
                                [username, questionId]
                            );

                            res.json({
                                correct: true,
                                xpGained: xpGained,
                                totalXP: newXP,
                                rank: newRank
                            });
                        }
                    );
                });
            }
        );
    });
});

// --- ADVANCED ---
router.post("/questions-advanced", (req, res) => {
    let {
        username, 
        includeCategories = [], 
        excludeCategories = [],
        includeDifficulties = [], 
        excludeDifficulties = [],
        includeGuilds = [], 
        excludeGuilds = [], 
        excludeAnswered = false
    } = req.body;

    includeCategories = includeCategories.map(x => x.toLowerCase());
    excludeCategories = excludeCategories.map(x => x.toLowerCase());

    includeDifficulties = includeDifficulties.map(x => x.toLowerCase());
    excludeDifficulties = excludeDifficulties.map(x => x.toLowerCase());

    includeGuilds = includeGuilds.map(x => x.toLowerCase());
    excludeGuilds = excludeGuilds.map(x => x.toLowerCase());

    let query = `
        SELECT q.*, u.username, u.major,
        EXISTS (
            SELECT 1 FROM user_correct_answers
            WHERE username = ? AND question_id = q.id
        ) AS answered
        FROM questions q
        JOIN users u ON q.user_id = u.id
        WHERE q.user_id != (SELECT id FROM users WHERE username = ?)
    `;

    const params = [username, username];

    if (includeCategories.length > 0) {
        query += ` AND q.category IN (${includeCategories.map(() => "?").join(",")})`;
        params.push(...includeCategories);
    }
    if (includeDifficulties.length > 0) {
        query += ` AND q.difficulty IN (${includeDifficulties.map(() => "?").join(",")})`;
        params.push(...includeDifficulties);
    }
    if (includeGuilds.length > 0) {
        query += ` AND u.major IN (${includeGuilds.map(() => "?").join(",")})`;
        params.push(...includeGuilds);
    }
    if (excludeCategories.length > 0) {
        query += ` AND q.category NOT IN (${excludeCategories.map(() => "?").join(",")})`;
        params.push(...excludeCategories);
    }
    if (excludeDifficulties.length > 0) {
        query += ` AND q.difficulty NOT IN (${excludeDifficulties.map(() => "?").join(",")})`;
        params.push(...excludeDifficulties);
    }
    if (excludeGuilds.length > 0) {
        query += ` AND u.major NOT IN (${excludeGuilds.map(() => "?").join(",")})`;
        params.push(...excludeGuilds);
    }
    if (excludeAnswered) {
        query += ` AND q.id NOT IN (SELECT question_id FROM user_correct_answers WHERE username = ?)`;
        params.push(username);
    }

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).send("Query error");
        res.json(rows);
    });
});

// --- USER OWNED QUESTIONS ---

// Get questions created by the current user 
router.get("/my-questions/:username", (req, res) => {
    db.get("SELECT id FROM users WHERE username = ?", [req.params.username], (err, user) => {
        if (!user) return res.status(404).send("User not found");

        db.all("SELECT * FROM questions WHERE user_id = ?", [user.id], (err, rows) => {
            if (err) return res.status(500).send("Error fetching questions");
            res.json(rows);
        });
    });
});

// Delete a question (Only owner delete)
router.post("/delete-question", (req, res) => {
    const { questionId, username } = req.body;

    db.get("SELECT id FROM users WHERE username = ?", [username], (err, user) => {
        if (!user) return res.status(404).send("User not found");

        db.run(
            "DELETE FROM questions WHERE id = ? AND user_id = ?",
            [questionId, user.id],
            function (err) {
                if (err) return res.status(500).send("Error deleting question");
                if (this.changes === 0) return res.status(403).send("Unauthorized");
                res.send("Deleted");
            }
        );
    });
});

// EDITING a question (only owner can edit)
router.post("/edit-question", (req, res) => {
    const { questionId, username, question, answer, difficulty, category } = req.body;

    db.get("SELECT id FROM users WHERE username = ?", [username], (err, user) => {
        if (!user) return res.status(404).send("User not found");

        db.run(
            `UPDATE questions SET question = ?, answer = ?, difficulty = ?, category = ? WHERE id = ? AND user_id = ?`,
            [question, answer, difficulty, category, questionId, user.id],
            function (err) {
                if (err) return res.status(500).send("Error updating question");
                if (this.changes === 0) return res.status(403).send("Unauthorized");
                res.send("Updated");
            }
        );
    });
});

module.exports = router;    // Exports the grouped routes so server.js can import them