const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");

const app = express();

app.use(express.static("frontend"));
app.use(bodyParser.json());

const db = new sqlite3.Database("./users.db");

// Create table if it doesn't exist
db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
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
                res.send("Login successful");
            } else {
                res.status(401).send("Invalid password");
            }
        }
    );
});

app.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});