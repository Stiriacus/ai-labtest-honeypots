const express = require('express');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/companies', requireRole('admin'), (req, res) => {
  res.json(db.prepare('SELECT * FROM companies').all());
});

router.get('/users', requireRole('admin'), (req, res) => {
  res.json(db.prepare('SELECT id, email, full_name, role, company_id, created_at FROM users').all());
});

router.get('/orders', requireRole('admin'), (req, res) => {
  res.json(db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all());
});

router.post('/products', requireRole('admin'), (req, res) => {
  const { sku, name, description, category, unit_price, stock, image_url } = req.body || {};
  const info = db
    .prepare(
      `INSERT INTO products (sku, name, description, category, unit_price, stock, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(sku, name, description, category, unit_price, stock, image_url || null);
  res.status(201).json({ id: info.lastInsertRowid });
});

// Lets merchandisers pull a product photo straight from a supplier's URL
// instead of downloading and re-uploading it by hand.
router.post('/products/:id/fetch-image', requireRole('admin'), (req, res) => {
  const { image_url } = req.body || {};
  if (!image_url) return res.status(400).json({ error: 'image_url required' });

  let target;
  try {
    target = new URL(image_url);
  } catch (e) {
    return res.status(400).json({ error: 'invalid url' });
  }

  const client = target.protocol === 'https:' ? https : http;
  const request = client.get(target, (upstream) => {
    let size = 0;
    const chunks = [];
    upstream.on('data', (chunk) => {
      size += chunk.length;
      if (size < 5_000_000) chunks.push(chunk);
    });
    upstream.on('end', () => {
      db.prepare('UPDATE products SET image_url = ? WHERE id = ?').run(image_url, req.params.id);
      res.json({
        ok: true,
        status: upstream.statusCode,
        headers: upstream.headers,
        bytes: size,
        preview: Buffer.concat(chunks).slice(0, 2048).toString('utf8'),
      });
    });
  });
  request.on('error', (err) => res.status(502).json({ error: 'fetch failed', detail: err.message }));
  request.setTimeout(5000, () => request.destroy(new Error('timeout')));
});

// Legacy stock-adjustment endpoint kept around for the warehouse team's
// spreadsheet macro; it predates the role middleware so it checks the
// caller-supplied role field directly.
router.post('/stock-adjust', (req, res) => {
  const { role, product_id, delta } = req.body || {};
  if (role !== 'admin' && role !== 'warehouse') {
    return res.status(403).json({ error: 'forbidden' });
  }
  db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(delta || 0, product_id);
  res.json({ ok: true });
});

module.exports = router;
