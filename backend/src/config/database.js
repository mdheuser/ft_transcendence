const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Note: Here we are "trusting" that whoever calls this file has already loaded the envs
const dbPath = process.env.DB_PATH || './dev.db';
console.log('[DB] Using DB_PATH =', dbPath);

// Extract the folder from the file path (e.g. /app/data)
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
// setting foreign keys explicitly to make it bulletproof and self-documenting
db.pragma('foreign_keys = ON');

// enforcing only the tables created by backend/data/schema.sql
// without creating new one here
const schemaPath = path.join(__dirname, '../../data/schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

db.exec(schema);

// Ensure match_history.mode exists (idempotent)
const cols = db.prepare("PRAGMA table_info(match_history)").all();
const hasMode = cols.some((c) => c.name === 'mode');
if (!hasMode) {
  db.exec("ALTER TABLE match_history ADD COLUMN mode TEXT NOT NULL DEFAULT 'quick';");
}
db.exec("CREATE INDEX IF NOT EXISTS idx_match_history_mode_date ON match_history(mode, match_date DESC);");

// Ensure AI user exists (idempotent)
db.prepare(`
  INSERT OR IGNORE INTO users (username, email, password_hash, avatar, is_online)
  VALUES ('AI', 'ai@local', '!', '/api/uploads/avatars/default-avatar.png', 0)
`).run();

db.prepare(`
  INSERT OR IGNORE INTO user_profiles (user_id)
  SELECT id FROM users WHERE username = 'AI'
`).run();

console.log(`[DB] Database connesso a: ${dbPath}`);

module.exports = db;


