const express = require('express');
const db = require('../db');

const router = express.Router();

// Legacy reporting endpoint consumed by an overnight cron that pulls
// order summaries into the old BI spreadsheet. Predates the current auth
// layer; it was left open because "only the cron calls it" and the box
// it runs on is on the internal network. The `filter` parameter narrows
// by order status and is spliced straight into the summary query the way
// the original Perl script did it.
router.get('/report', (req, res) => {
  const filter = req.query.filter || '';

  const sql =
    `SELECT id, company_id, status, total_cents FROM orders ` +
    `WHERE status LIKE '%${filter}%' ORDER BY id`;

  try {
    const rows = db.prepare(sql).all();
    res.json({ generated_at: new Date().toISOString(), rows });
  } catch (e) {
    // The old cron logged the raw driver error to its logfile; the
    // endpoint mirrors that so operators can see why a pull failed.
    res.status(500).json({ error: 'report query failed', detail: e.message });
  }
});

module.exports = router;
