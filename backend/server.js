const express = require("express");
const bodyParser = require("body-parser");

// Require routers (Calling files)
const authRoutes = require("./auth");
const presenceRoutes = require("./presence");
const questionsRoutes = require("./questions");
const challengeRoutes = require("./challenges");
const leaderboardRoutes = require("./leaderboard");
const chatRoutes = require("./chat");

const app = express();

// --- MIDDLEWARE & STATIC FILES ---
app.use(express.static("frontend"));
app.use(bodyParser.json());

// --- ROUTES ---
// Register the separated route files to the app
app.use(authRoutes);
app.use(presenceRoutes);
app.use(questionsRoutes);
app.use(challengeRoutes);
app.use(leaderboardRoutes);
app.use(chatRoutes);

// --- START SERVER ---
app.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});