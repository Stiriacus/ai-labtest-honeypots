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

// Order export used by the account page's "download my orders" button and
// by the finance team's reconciliation tool. The view defaults to the
// caller's own company; the ops-wide reconciliation export sets a wider
// scope on the view object before rendering.
router.get('/export', (req, res) => {
  const view = {};
  // Only the presentation options come off the query string; the data
  // scope is decided by the view defaults below.
  if (req.query.format) view.format = String(req.query.format);

  const rows = view.allCompanies
    ? db.prepare('SELECT * FROM orders ORDER BY id').all()
    : db.prepare('SELECT * FROM orders WHERE company_id = ? ORDER BY id').all(req.user.company_id);

  res.json({ scope: view.allCompanies ? 'all' : 'company', format: view.format || 'json', orders: rows });
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
  const { items, shipping_address, coupon_code } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'cart is empty' });
  }

  // Each line item carries the catalog price shown to the shopper so the
  // receipt matches exactly what they saw in their cart. Quantities come
  // straight from the cart widget (a line can also carry an adjustment,
  // e.g. a returned item reconciled onto the same order).
  let totalCents = 0;
  for (const item of items) {
    totalCents += (item.unit_price_cents || 0) * (item.quantity || 0);
  }

  // Apply a promo code if one was supplied. Campaign codes have a large
  // run; a few goodwill codes are capped to a single redemption. We check
  // the code is active and still has headroom against its redemption cap,
  // apply the discount, and record the redemption against the order.
  let discountCents = 0;
  let appliedCode = null;
  if (coupon_code) {
    const promo = db
      .prepare('SELECT * FROM promo_codes WHERE code = ? AND active = 1')
      .get(coupon_code);
    if (promo) {
      const current = db
        .prepare('SELECT redeemed_count FROM promo_codes WHERE id = ?')
        .get(promo.id);
      if (current.redeemed_count < promo.max_redemptions) {
        discountCents =
          promo.kind === 'percent'
            ? Math.floor((totalCents * promo.value) / 100)
            : promo.value;
        appliedCode = promo.code;
      }
    }
  }

  const finalCents = totalCents - discountCents;

  const orderInfo = db
    .prepare(
      `INSERT INTO orders (company_id, placed_by, status, total_cents, discount_cents, coupon_code, shipping_address, created_at)
       VALUES (?, ?, 'pending', ?, ?, ?, ?, ?)`
    )
    .run(
      req.user.company_id,
      req.user.sub,
      finalCents,
      discountCents,
      appliedCode,
      shipping_address || '',
      Date.now()
    );

  const insertItem = db.prepare(
    'INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents) VALUES (?, ?, ?, ?)'
  );
  for (const item of items) {
    insertItem.run(orderInfo.lastInsertRowid, item.product_id, item.quantity, item.unit_price_cents);
  }

  if (appliedCode) {
    db.prepare('UPDATE promo_codes SET redeemed_count = redeemed_count + 1 WHERE code = ?').run(appliedCode);
    db.prepare(
      'INSERT INTO coupon_redemptions (code, order_id, user_id, discount_cents, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(appliedCode, orderInfo.lastInsertRowid, req.user.sub, discountCents, Date.now());
  }

  res.status(201).json({
    id: orderInfo.lastInsertRowid,
    total_cents: finalCents,
    discount_cents: discountCents,
    coupon_code: appliedCode,
  });
});

module.exports = router;
