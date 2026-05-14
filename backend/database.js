// ---DATABASE INITIALIZATION ---

const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./users.db");

db.serialize(() => {
    // User accounts and stats
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        major TEXT,
        xp INTEGER DEFAULT 0,
        rank TEXT DEFAULT 'Bronze'
    )`);

    // Chat reactions
    db.run(`CREATE TABLE IF NOT EXISTS reactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER,
        user_id INTEGER,
        emoji TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // Track online status
    db.run(`CREATE TABLE IF NOT EXISTS active_users (
        user_id INTEGER PRIMARY KEY,
        guild TEXT,
        last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
        room TEXT DEFAULT 'global',
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // Question bank
    db.run(`CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question TEXT,
        answer TEXT,
        difficulty TEXT,
        category TEXT,
        user_id INTEGER NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // Track which questions each user has answered correctly to prevent repeat XP farming
    db.run(`CREATE TABLE IF NOT EXISTS user_correct_answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        question_id INTEGER,
        UNIQUE(username, question_id)
    )`);

    // Guild Challenges (similar to questions)
    db.run(`CREATE TABLE IF NOT EXISTS challenges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        challenger_username TEXT,
        challenger_major TEXT,
        question_id INTEGER,
        status TEXT DEFAULT 'pending'
    )`);

    // Chat History
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        guild TEXT,
        message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        room TEXT DEFAULT 'global',
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
});

module.exports = db;    // Exports the grouped routes so server.js can import them