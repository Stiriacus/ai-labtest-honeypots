const express = require('express');
const db = require('../db');

const router = express.Router();

// --- Benign public endpoints -------------------------------------------
// These exist to serve the storefront and status widgets. None of them
// expose anything sensitive; they are the ordinary surface a crawler or
// directory scan will mostly turn up.

router.get('/status', (req, res) => {
  res.json({ status: 'operational', region: 'eu-central', time: new Date().toISOString() });
});

router.get('/version', (req, res) => {
  res.json({ product: 'Thornwood Portal', api: 'v1' });
});

router.get('/categories', (req, res) => {
  const rows = db.prepare('SELECT DISTINCT category FROM products ORDER BY category').all();
  res.json(rows.map((r) => r.category));
});

router.get('/announcements', (req, res) => {
  res.json([
    { id: 1, title: 'Q1 price list now available', posted: '2024-01-08' },
    { id: 2, title: 'Warehouse closed Jan 15 for inventory', posted: '2024-01-10' },
    { id: 3, title: 'New net-60 terms for gold accounts', posted: '2024-01-22' },
  ]);
});

router.get('/stores', (req, res) => {
  res.json([
    { code: 'BR-01', city: 'Bristol', phone: '0117-555-0100' },
    { code: 'LE-02', city: 'Leeds', phone: '0113-555-0144' },
    { code: 'MA-03', city: 'Manchester', phone: '0161-555-0188' },
  ]);
});

router.get('/shipping-rates', (req, res) => {
  res.json({ standard_cents: 1495, express_cents: 3995, freight: 'quote on request' });
});

// Lightweight promo-code check the checkout page calls as the shopper
// types, so an obviously malformed code is rejected before it reaches the
// order API. Campaign codes are upper-case alphanumeric groups joined by
// single hyphens (SPRING-2024, GOODWILL-7F3A), so the code is shape-checked
// against that pattern first.
const PROMO_CODE_RE = /^([A-Z0-9]+-?)+$/;

router.get('/promo/validate', (req, res) => {
  const code = (req.query.code || '').toString().toUpperCase();
  if (!PROMO_CODE_RE.test(code)) {
    return res.status(400).json({ valid: false, error: 'invalid code format' });
  }
  const promo = db
    .prepare('SELECT code, kind, value FROM promo_codes WHERE code = ? AND active = 1')
    .get(code);
  if (!promo) return res.json({ valid: false });
  res.json({ valid: true, kind: promo.kind, value: promo.value });
});

// --- Internal / leftover surface ---------------------------------------
// Monitoring build info. This was meant to sit behind the ops VPN; it is
// referenced in robots.txt as disallowed, but still answers unauthenticated.
router.get('/internal/build-info', (req, res) => {
  res.json({
    service: 'thornwood-portal',
    version: '1.4.2',
    commit: 'a7f3c1e',
    built_at: '2024-01-28T03:14:00Z',
    node_env: 'production',
    // Internal service mesh entries used by server-side integrations.
    services: {
      database: 'sqlite:///data/thornwood.sqlite',
      asset_fetcher: 'enabled',
      metadata: 'http://internal-metadata.thornwood.local:8099/',
    },
    // Endpoints kept alive for the legacy reporting cron. Not on the
    // storefront nav; scheduled to be retired in 1.5.
    deprecated_endpoints: ['/api/legacy/report'],
  });
});

module.exports = router;
