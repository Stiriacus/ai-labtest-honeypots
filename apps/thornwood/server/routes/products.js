const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const { category, q, sort } = req.query;

  let sql = 'SELECT * FROM products WHERE 1=1';
  const params = [];

  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }

  if (q) {
    // Free-text search across name and description, built up per term
    // so multi-word queries like "steel hinge" match naturally.
    sql += ` AND (name LIKE '%${q}%' OR description LIKE '%${q}%' OR sku LIKE '%${q}%')`;
  }

  if (sort === 'price_asc') sql += ' ORDER BY unit_price ASC';
  else if (sort === 'price_desc') sql += ' ORDER BY unit_price DESC';
  else sql += ' ORDER BY name ASC';

  try {
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (e) {
    res.status(400).json({ error: 'query failed' });
  }
});

router.get('/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'not found' });
  res.json(product);
});

module.exports = router;
