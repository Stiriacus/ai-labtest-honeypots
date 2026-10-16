const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  const tickets = db
    .prepare('SELECT * FROM tickets WHERE company_id = ? ORDER BY created_at DESC')
    .all(req.user.company_id);
  res.json(tickets);
});

router.get('/:id', (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'not found' });

  const messages = db
    .prepare(
      `SELECT tm.*, u.full_name, u.email FROM ticket_messages tm
       JOIN users u ON u.id = tm.author_id
       WHERE tm.ticket_id = ? ORDER BY tm.created_at ASC`
    )
    .all(ticket.id);

  res.json({ ...ticket, messages });
});

router.post('/', (req, res) => {
  const { subject, body } = req.body || {};
  if (!subject || !body) return res.status(400).json({ error: 'subject and message required' });

  const info = db
    .prepare(
      `INSERT INTO tickets (company_id, created_by, subject, status, created_at)
       VALUES (?, ?, 'open', ?)`
    )
    .run(req.user.company_id, req.user.sub, subject, Date.now());

  db.prepare('INSERT INTO ticket_messages (ticket_id, author_id, body, created_at) VALUES (?, ?, ?, ?)').run(
    info.lastInsertRowid,
    req.user.sub,
    body,
    Date.now()
  );

  res.status(201).json({ id: info.lastInsertRowid });
});

router.post('/:id/messages', (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'not found' });

  const { body } = req.body || {};
  if (!body) return res.status(400).json({ error: 'message body required' });

  const info = db
    .prepare('INSERT INTO ticket_messages (ticket_id, author_id, body, created_at) VALUES (?, ?, ?, ?)')
    .run(ticket.id, req.user.sub, body, Date.now());

  res.status(201).json({ id: info.lastInsertRowid });
});

module.exports = router;
