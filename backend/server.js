const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");

const app = express();

app.use(express.static("frontend"));
app.use(bodyParser.json());

const db = new sqlite3.Database("./users.db");

// Create user table if it doesn't exist
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

app.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});