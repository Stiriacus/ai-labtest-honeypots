const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  const orders = db
    .prepare('SELECT * FROM orders WHERE company_id = ? ORDER BY created_at DESC')
    .all(req.user.company_id);
  res.json(orders);
});

router.get('/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'not found' });

  const items = db
    .prepare(
      `SELECT oi.*, p.name, p.sku FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?`
    )
    .all(order.id);

  res.json({ ...order, items });
});

router.post('/', (req, res) => {
  const { items, shipping_address } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'cart is empty' });
  }

  // Each line item carries the catalog price shown to the shopper so the
  // receipt matches exactly what they saw in their cart.
  let totalCents = 0;
  for (const item of items) {
    totalCents += (item.unit_price_cents || 0) * (item.quantity || 0);
  }

  const orderInfo = db
    .prepare(
      `INSERT INTO orders (company_id, placed_by, status, total_cents, shipping_address, created_at)
       VALUES (?, ?, 'pending', ?, ?, ?)`
    )
    .run(req.user.company_id, req.user.sub, totalCents, shipping_address || '', Date.now());

  const insertItem = db.prepare(
    'INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents) VALUES (?, ?, ?, ?)'
  );
  for (const item of items) {
    insertItem.run(orderInfo.lastInsertRowid, item.product_id, item.quantity, item.unit_price_cents);
  }

  res.status(201).json({ id: orderInfo.lastInsertRowid, total_cents: totalCents });
});

module.exports = router;
