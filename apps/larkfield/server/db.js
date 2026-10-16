const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'larkfield.sqlite');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS orgs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'team'
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'analyst',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (org_id) REFERENCES orgs(id)
);

CREATE TABLE IF NOT EXISTS tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS dashboards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private',
  FOREIGN KEY (org_id) REFERENCES orgs(id)
);

CREATE TABLE IF NOT EXISTS data_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  last_sync_url TEXT,
  FOREIGN KEY (org_id) REFERENCES orgs(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  actor TEXT,
  action TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (org_id) REFERENCES orgs(id)
);

-- Seat invitations. An org admin generates a single-use code and sends it
-- to a colleague; redeeming it provisions their account in the org with
-- the role the invite was cut for.
CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  org_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'analyst',
  email_hint TEXT,
  redeemed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (org_id) REFERENCES orgs(id)
);

-- Saved dashboard layout/widget settings, stored as a JSON blob so the
-- front-end can introduce new widget options without a migration. The
-- editor saves only the keys it changed, which are merged server-side.
CREATE TABLE IF NOT EXISTS dashboard_layouts (
  dashboard_id INTEGER PRIMARY KEY,
  layout_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER,
  FOREIGN KEY (dashboard_id) REFERENCES dashboards(id)
);
`);

module.exports = db;
