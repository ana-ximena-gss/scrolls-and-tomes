// --- AUTHENTICATION ROUTES ---

const express = require("express");
const bcrypt = require("bcrypt");
const db = require("./database");   // retriving from database.js

const router = express.Router(); // Creates a modular "mini-app" to group related routes

//Handles new user registration
router.post("/signup", async (req, res) => {
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

//Handles existing user login
router.post("/login", (req, res) => {
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

module.exports = router;    // Exports the grouped routes so server.js can import them