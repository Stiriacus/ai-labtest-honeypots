const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);
// HR sync + warehouse provisioning tooling calls these, so warehouse
// integration accounts are allowed in alongside admins.
router.use(requireRole('admin', 'warehouse'));

router.get('/users', (req, res) => {
  const rows = db
    .prepare('SELECT id, company_id, email, full_name, role FROM users ORDER BY id')
    .all();
  res.json(rows);
});

router.patch('/users/:id', (req, res) => {
  const patch = req.body || {};

  // The provisioning tool sends whatever changed on the HR record, so
  // the handler applies the supplied columns directly instead of a
  // fixed field list that drifts every time HR adds an attribute.
  const allowed = ['full_name', 'email', 'role', 'company_id'];
  const cols = [];
  const args = [];
  for (const key of allowed) {
    if (key in patch) {
      cols.push(`${key} = ?`);
      args.push(patch[key]);
    }
  }
  if (cols.length === 0) {
    return res.status(400).json({ error: 'no updatable fields supplied' });
  }

  args.push(req.params.id);
  db.prepare(`UPDATE users SET ${cols.join(', ')} WHERE id = ?`).run(...args);
  res.json({ ok: true });
});

module.exports = router;
