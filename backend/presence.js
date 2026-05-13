// --- USER PRESENCE ---

const express = require("express");
const db = require("./database"); // retriving from database.js

const router = express.Router();  // Creates a "mini-app" to group related routes

// Updates user's "last active" timestamp to keep them online
router.post("/heartbeat", (req, res) => {
    const { username, guild, room } = req.body;

    db.get("SELECT id FROM users WHERE username = ?", [username], (err, user) => {
        if (!user) return res.status(404).send("User not found");

        db.run(
            `INSERT OR REPLACE INTO active_users (user_id, guild, room, last_active)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
            [user.id, guild, room],
            (err) => {
                if (err) return res.status(500).send("Error");
                res.sendStatus(200);
            }
        );
    });
});

// Cleanup: Remove users who haven't sent a heartbeat in 15 seconds
setInterval(() => {
    db.run("DELETE FROM active_users WHERE last_active < datetime('now', '-15 seconds')");
}, 5000);

// Get list of users currently in a specific room 
router.get("/active-users/:room", (req, res) => {
    db.all("SELECT u.username FROM active_users a JOIN users u ON a.user_id = u.id WHERE room = ?", [req.params.room], (err, rows) => {
        if (err) return res.status(500).json([]);
        res.json(rows);
    });
});

// Explicitly set user as offline
router.post("/go-offline", (req, res) => {
    const { username } = req.body;
    db.run("DELETE FROM active_users WHERE user_id = (SELECT id FROM users WHERE username = ?)", [username], (err) => {
        if (err) return res.status(500).send("Error");
        res.sendStatus(200);
    });
});

module.exports = router;    // Exports the grouped routes so server.js can import them