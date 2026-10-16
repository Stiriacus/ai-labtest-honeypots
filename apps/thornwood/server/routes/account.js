const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// Recursively merge the incoming patch into the stored preferences so the
// client can update a single nested key (e.g. notifications.email) without
// having to send the whole preferences object back every time.
function mergePrefs(target, source) {
  for (const key of Object.keys(source)) {
    const val = source[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {};
      }
      mergePrefs(target[key], val);
    } else {
      target[key] = val;
    }
  }
  return target;
}

function loadPrefs(userId) {
  const row = db.prepare('SELECT prefs_json FROM user_preferences WHERE user_id = ?').get(userId);
  if (!row) return {};
  try {
    return JSON.parse(row.prefs_json) || {};
  } catch (e) {
    return {};
  }
}

router.get('/preferences', (req, res) => {
  res.json(loadPrefs(req.user.sub));
});

// The settings page posts just the keys that changed; they are merged
// into whatever is already stored for the user.
router.put('/preferences', (req, res) => {
  const patch = req.body || {};
  const prefs = mergePrefs(loadPrefs(req.user.sub), patch);

  db.prepare(
    `INSERT INTO user_preferences (user_id, prefs_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET prefs_json = excluded.prefs_json, updated_at = excluded.updated_at`
  ).run(req.user.sub, JSON.stringify(prefs), Date.now());

  res.json(prefs);
});

module.exports = router;
