// --- CHALLENGE SYSTEM ---

const express = require("express");
const db = require("./database");   // retriving from database.js
const { calculateXP, determineRank } = require("./rankingXP.js"); // retriving from rankingXP.js

const router = express.Router(); // Creates a "mini-app" to group related routes

//Create a challenge for other guilds to solve
router.post("/create-challenge", (req, res) => {
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

// Get challenges created by guilds other than the user's own guild
router.get("/challenges/:myMajor", (req, res) => {
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

// Solve a challenge question and earn a 1.5x XP bonus
router.post("/answer-challenge", (req, res) => {
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

                // Updates xp when challenge is completed
                db.run("UPDATE challenges SET status = 'completed' WHERE id = ?", [challenge_id], () => {
                    const baseXP = calculateXP(question.difficulty);
                    const totalXPGained = Math.floor(baseXP * 1.5);
                    const newXP = user.xp + totalXPGained;
                    const newRank = determineRank(newXP);

                    db.run("UPDATE users SET xp = ?, rank = ? WHERE username = ?", [newXP, newRank, username], (err) => {
                        if (err) return res.status(500).send("Error updating stats.");
                        res.json({
                            correct: true,
                            message: `Challenge Completed! You defeated a ${question.difficulty} challenge from the ${challenge.challenger_major} guild.`,
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

module.exports = router;    // Exports the grouped routes so server.js can import them