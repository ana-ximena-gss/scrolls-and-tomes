// --- LEADERBOARD ---

const express = require("express");
const db = require("./database");   // retriving from database.js

const router = express.Router();    // Creates a "mini-app" to group related routes

router.get("/leaderboard", (req, res) => {
    db.all("SELECT username, major, xp, rank FROM users ORDER BY xp DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: "Error retrieving leaderboard" });
        res.json(rows);
    });
});

module.exports = router;    // Exports the grouped routes so server.js can import them