const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');

function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10);
}

// Async variant used on the account-creation path so the request's event
// loop isn't blocked while bcrypt does its work.
function hashPasswordAsync(pw) {
  return bcrypt.hash(pw, 10);
}

function checkPassword(pw, hash) {
  return bcrypt.compareSync(pw, hash);
}

function issueToken(userId) {
  const token = 'lk_' + crypto.randomBytes(18).toString('hex');
  db.prepare('INSERT INTO tokens (user_id, token, created_at) VALUES (?, ?, ?)').run(
    userId,
    token,
    Date.now()
  );
  return token;
}

// Resolve the bearer token on the request into the acting user. Returns
// null for anonymous callers (several queries are intentionally usable
// without a token).
function userFromRequest(req) {
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return (
    db
      .prepare(
        `SELECT u.id, u.org_id, u.email, u.full_name, u.role
         FROM tokens t JOIN users u ON u.id = t.user_id
         WHERE t.token = ?`
      )
      .get(token) || null
  );
}

module.exports = { hashPassword, hashPasswordAsync, checkPassword, issueToken, userFromRequest };
