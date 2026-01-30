PRAGMA foreign_keys = ON;

-- USER TABLES

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    google_id TEXT UNIQUE,
    display_name TEXT,
    avatar TEXT,
    is_online INTEGER NOT NULL DEFAULT 0,
    two_fa_enabled BOOLEAN DEFAULT 0,
    two_fa_secret TEXT,
    last_seen TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_display_name_unique
ON users(display_name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS user_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    bio TEXT,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    total_games INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS friendships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    friend_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, friend_id)
);

-- JWT SESSIONS (for JWT module)

CREATE TABLE IF NOT EXISTS jwt_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- GAME TABLES

CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_type TEXT,
    status TEXT DEFAULT 'waiting',
    winner_id INTEGER,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    FOREIGN KEY (winner_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS game_players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    user_id INTEGER,
    player_alias TEXT NOT NULL,
    score INTEGER DEFAULT 0,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS match_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER UNIQUE NOT NULL,
    player1_id INTEGER NOT NULL,
    player2_id INTEGER NOT NULL,
    player1_score INTEGER NOT NULL,
    player2_score INTEGER NOT NULL,
    winner_id INTEGER NOT NULL,
    match_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    mode TEXT NOT NULL DEFAULT 'quick',
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    FOREIGN KEY (player1_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (player2_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (winner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- indexes prevent match history queries from becoming slow
CREATE INDEX IF NOT EXISTS idx_match_history_p1_date ON match_history(player1_id, match_date DESC);
CREATE INDEX IF NOT EXISTS idx_match_history_p2_date ON match_history(player2_id, match_date DESC);
CREATE INDEX IF NOT EXISTS idx_match_history_winner_date ON match_history(winner_id, match_date DESC);
CREATE INDEX IF NOT EXISTS idx_match_history_mode_date ON match_history(mode, match_date DESC);


-- TOURNAMENT TABLES

CREATE TABLE IF NOT EXISTS tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    max_players INTEGER NOT NULL,
    winner_id INTEGER,
    blockchain_tx_hash TEXT,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (winner_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tournament_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL,
    user_id INTEGER,
    participant_alias TEXT NOT NULL,
    final_position INTEGER,
    final_score INTEGER DEFAULT 0,
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tournament_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL,
    game_id INTEGER,
    round_number INTEGER NOT NULL,
    participant1_id INTEGER NOT NULL,
    participant2_id INTEGER NOT NULL,
    winner_id INTEGER,
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE SET NULL,
    FOREIGN KEY (participant1_id) REFERENCES tournament_participants(id),
    FOREIGN KEY (participant2_id) REFERENCES tournament_participants(id),
    FOREIGN KEY (winner_id) REFERENCES tournament_participants(id)
);

-- Ensure AI profile exists
INSERT OR IGNORE INTO users (username, email, password_hash, avatar, is_online)
VALUES ('AI', 'ai@local', '!', '/api/uploads/avatars/ai_player.png', 0);

INSERT OR IGNORE INTO user_profiles (user_id)
SELECT id FROM users WHERE username = 'AI';
