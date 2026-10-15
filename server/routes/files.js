const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const AVATAR_DIR = path.join(__dirname, '..', '..', 'uploads', 'avatars');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AVATAR_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 } });

router.post('/avatar', requireAuth, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file uploaded' });
  const relPath = req.file.filename;
  db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?').run(relPath, req.user.sub);
  res.json({ ok: true, avatar_path: relPath });
});

router.get('/avatar/:filename', (req, res) => {
  const filePath = path.join(AVATAR_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'not found' });
  res.sendFile(filePath);
});

module.exports = router;
