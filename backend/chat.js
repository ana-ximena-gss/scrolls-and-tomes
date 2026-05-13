// --- MESSAGING & REACTIONS ---

const express = require("express");
const db = require("./database");   // retriving from database.js

const router = express.Router(); // Creates a "mini-app" to group related routes

// Send a message
router.post("/send-message", (req, res) => {
    const { username, room, message } = req.body;

    db.get("SELECT id FROM users WHERE username = ?", [username], (err, user) => {
        if (!user) return res.status(404).send("User not found");

        // auto-clean messages older then 2 months
        db.run(`DELETE FROM messages WHERE timestamp <= datetime('now', '-2 months')`);

        db.run(
            "INSERT INTO messages (user_id, room, message) VALUES (?, ?, ?)",
            [user.id, room, message],
            (err) => {
                if (err) return res.status(500).send("Error sending message");
                res.send("Message sent");
            }
        );
    });
});

// Gets messages for a room combined with their reaction data
router.get("/messages/:room", (req, res) => {
    const room = req.params.room;

    db.all(
        `SELECT m.*, u.username 
         FROM messages m
         JOIN users u ON m.user_id = u.id
         WHERE m.room = ?
         ORDER BY m.timestamp ASC`,
        [room],
        (err, messages) => {
            if (err) return res.status(500).json({ error: "Error :(" });

            db.all(
                `SELECT r.*, u.username 
                 FROM reactions r
                 JOIN users u ON r.user_id = u.id`,
                [],
                (err, reactions) => {

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
                }
            );
        }
    );
});

// Toggle a reaction (Add or Remove)
router.post("/toggle-reaction", (req, res) => {
    const { messageId, username, emoji } = req.body;

    db.get("SELECT id FROM users WHERE username = ?", [username], (err, user) => {
        if (err || !user) return res.status(404).send("User not found");

        const checkQuery = "SELECT id FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?";

        // Remove if it has a reaction
        db.get(checkQuery, [messageId, user.id, emoji], (err, row) => {
            if (row) {
                db.run("DELETE FROM reactions WHERE id = ?", [row.id], () => {
                    res.send("Removed");
                });
            } else {
                // Add if not exits
                db.run(
                    "INSERT INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)",
                    [messageId, user.id, emoji],
                    () => res.send("Added")
                );
            }
        });
    });
});

// Deletes a specific message (Only if it belongs to the user)
router.post("/delete-message", (req, res) => {
    const { messageId, username } = req.body;
    db.run(
        "DELETE FROM messages WHERE id = ? AND user_id = (SELECT id FROM users WHERE username = ?)",
        [messageId, username],
        function (err) {
            if (err) return res.status(500).send("Error deleting");
            if (this.changes === 0) return res.status(403).send("Unauthorized");
            res.send("Message deleted");
        }
    );
});

module.exports = router;    // Exports the grouped routes so server.js can import them