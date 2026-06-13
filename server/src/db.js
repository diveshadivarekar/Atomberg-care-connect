// db.js — lightweight persistence layer using SQLite (file-based, zero setup)
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'atomberg_care.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_by TEXT,
  status TEXT DEFAULT 'created',   -- created | active | ended
  created_at INTEGER,
  ended_at INTEGER
);

CREATE TABLE IF NOT EXISTS invites (
  token TEXT PRIMARY KEY,
  session_id TEXT,
  role TEXT,           -- 'customer'
  used INTEGER DEFAULT 0,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  role TEXT,           -- 'agent' | 'customer'
  name TEXT,
  joined_at INTEGER,
  left_at INTEGER
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  sender_role TEXT,
  sender_name TEXT,
  body TEXT,
  file_url TEXT,
  file_name TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS recordings (
  session_id TEXT PRIMARY KEY,
  status TEXT DEFAULT 'none',  -- none | in_progress | processing | ready | failed
  file_path TEXT,
  started_at INTEGER,
  ended_at INTEGER
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  type TEXT,
  payload TEXT,
  created_at INTEGER
);
`);

module.exports = db;
