const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'thornwood-dev-secret';

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, company_id: user.company_id },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

// Resolve the caller to a user record. Interactive sessions carry the JWT
// in the `session` cookie; machine clients (warehouse sync, the scanner
// app, reporting cron) send a long-lived integration token as a bearer
// instead, which maps to the user that owns the integration.
function resolveUser(req) {
  const cookieToken = req.cookies && req.cookies.session;
  if (cookieToken) {
    try {
      return jwt.verify(cookieToken, JWT_SECRET);
    } catch (e) {
      /* fall through to bearer */
    }
  }

  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    const row = db
      .prepare(
        `SELECT u.id AS sub, u.email, u.role, u.company_id
         FROM api_tokens t JOIN users u ON u.id = t.user_id
         WHERE t.token = ?`
      )
      .get(bearer);
    if (row) return row;
  }
  return null;
}

function requireAuth(req, res, next) {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: 'not authenticated' });
  req.user = user;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}

module.exports = { signToken, requireAuth, requireRole, resolveUser, JWT_SECRET };
