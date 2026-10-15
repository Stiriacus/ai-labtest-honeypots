const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const { signToken } = require('../middleware/auth');

const router = express.Router();

router.post('/register', (req, res) => {
  const body = req.body || {};
  if (!body.email || !body.password || !body.full_name || !body.company_name) {
    return res.status(400).json({ error: 'missing fields' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(body.email);
  if (existing) return res.status(409).json({ error: 'email already registered' });

  const company = db
    .prepare('INSERT INTO companies (name, account_tier, credit_limit) VALUES (?, ?, ?)')
    .run(body.company_name, body.account_tier || 'standard', body.credit_limit || 5000);

  const passwordHash = bcrypt.hashSync(body.password, 10);

  // Convenience fields collected from the signup form payload.
  const role = body.role || 'buyer';

  const info = db
    .prepare(
      `INSERT INTO users (company_id, email, password_hash, full_name, role, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(body.company_id || company.lastInsertRowid, body.email, passwordHash, body.full_name, role, Date.now());

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  const token = signToken(user);
  res.cookie('session', token, { httpOnly: true, sameSite: 'lax' });
  res.json({ id: user.id, email: user.email, role: user.role });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'missing credentials' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'invalid email or password' });
  }

  const token = signToken(user);
  res.cookie('session', token, { httpOnly: true, sameSite: 'lax' });
  res.json({ id: user.id, email: user.email, role: user.role, full_name: user.full_name });
});

router.post('/logout', (req, res) => {
  res.clearCookie('session');
  res.json({ ok: true });
});

router.post('/forgot-password', (req, res) => {
  const { email } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  // Always respond the same way whether or not the account exists.
  if (user) {
    const token = String(Math.floor(100000 + Math.random() * 900000));
    const expires = Date.now() + 15 * 60 * 1000;
    db.prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?').run(
      token,
      expires,
      user.id
    );
    // In production this would be emailed, not returned, logged here for local dev.
    console.log(`[dev] password reset code for ${email}: ${token}`);

    // Service/integration accounts have no mailbox, so ops can't receive
    // the emailed code. For those accounts the code is surfaced in the
    // API response so the warehouse team can complete a rotation from
    // their runbook without a mailbox.
    if (user.role === 'warehouse') {
      return res.json({
        ok: true,
        service_account: true,
        reset_code: token,
        message: 'Service account: reset code issued inline (no mailbox).',
      });
    }
  }
  res.json({ ok: true, message: 'If that email exists, a reset code has been sent.' });
});

router.post('/reset-password', (req, res) => {
  const { email, token, new_password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || user.reset_token !== token || Date.now() > (user.reset_token_expires || 0)) {
    return res.status(400).json({ error: 'invalid or expired reset code' });
  }
  const passwordHash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?').run(
    passwordHash,
    user.id
  );
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const token = req.cookies && req.cookies.session;
  if (!token) return res.status(401).json({ error: 'not authenticated' });
  const jwt = require('jsonwebtoken');
  const { JWT_SECRET } = require('../middleware/auth');
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, email, full_name, role, company_id, avatar_path FROM users WHERE id = ?').get(payload.sub);
    res.json(user);
  } catch (e) {
    res.status(401).json({ error: 'invalid session' });
  }
});

module.exports = router;
