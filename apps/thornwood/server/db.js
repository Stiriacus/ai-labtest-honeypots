const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'thornwood.sqlite');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  account_tier TEXT NOT NULL DEFAULT 'standard',
  credit_limit INTEGER NOT NULL DEFAULT 5000,
  billing_notes TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'buyer',
  avatar_path TEXT,
  reset_token TEXT,
  reset_token_expires INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  image_url TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  placed_by INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  total_cents INTEGER NOT NULL DEFAULT 0,
  shipping_address TEXT,
  internal_notes TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (placed_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  created_by INTEGER NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id),
  FOREIGN KEY (author_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sessions_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  ip TEXT,
  user_agent TEXT,
  path TEXT,
  created_at INTEGER NOT NULL
);

-- Long-lived bearer tokens issued to machine clients (warehouse sync,
-- the mobile scanner app, reporting cron) so they don't log in with a
-- password on every run. Scoped to the user that owns the integration.
CREATE TABLE IF NOT EXISTS api_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Promotional / goodwill discount codes applied at checkout. Some are
-- broad campaign codes with a large run; others are one-off goodwill
-- credits issued to a single account after a complaint, capped to a
-- small number of redemptions.
CREATE TABLE IF NOT EXISTS promo_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL DEFAULT 'percent',      -- 'percent' | 'fixed'
  value INTEGER NOT NULL,                     -- percent 0-100, or fixed cents
  max_redemptions INTEGER NOT NULL DEFAULT 1,
  redeemed_count INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  note TEXT
);

-- One row per time a promo code is applied to an order, kept for the
-- finance team's campaign reconciliation.
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  order_id INTEGER,
  user_id INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Free-form per-user UI/account preferences (saved filters, default
-- shipping address, notification toggles). Stored as a JSON blob so the
-- client can add new preference keys without a schema change.
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id INTEGER PRIMARY KEY,
  prefs_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER
);
`);

// Column additions for databases seeded before the promo feature landed.
// ALTER fails if the column already exists, which is fine to ignore.
for (const stmt of [
  'ALTER TABLE orders ADD COLUMN coupon_code TEXT',
  'ALTER TABLE orders ADD COLUMN discount_cents INTEGER NOT NULL DEFAULT 0',
]) {
  try {
    db.exec(stmt);
  } catch (e) {
    /* column already present */
  }
}

module.exports = db;
