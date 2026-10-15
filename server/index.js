const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const ticketRoutes = require('./routes/tickets');
const adminRoutes = require('./routes/admin');
const fileRoutes = require('./routes/files');
const reconRoutes = require('./routes/recon');
const legacyRoutes = require('./routes/legacy');
const internalRoutes = require('./routes/internal');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// The portal sits behind an nginx reverse proxy in production; the proxy
// sets the Server header the clients actually see. The app does not
// advertise Express globally (one legacy router still does — see below).
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('Server', 'nginx/1.24.0');
  res.setHeader('X-Thornwood-Node', 'web-03');
  next();
});

app.use(bodyParser.json({ limit: '1mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  try {
    db.prepare('INSERT INTO sessions_log (ip, user_agent, path, created_at) VALUES (?, ?, ?, ?)').run(
      req.ip,
      req.headers['user-agent'] || '',
      req.path,
      Date.now()
    );
  } catch (e) {
    // logging must never break a request
  }
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/files', fileRoutes);
// recon router owns the benign surface and the unauthenticated
// /api/internal/build-info leftover; it is mounted before the auth-gated
// /api/internal user-management router so build-info stays open while
// /api/internal/users falls through to the protected handler.
app.use('/api', reconRoutes);
app.use('/api/internal', internalRoutes);

// The legacy reporting router is still served by the old integration
// app process, which was built on an earlier Express and leaks its
// fingerprint. Kept mounted here for compatibility.
app.use('/api/legacy', (req, res, next) => {
  res.setHeader('X-Powered-By', 'Express');
  next();
}, legacyRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Unknown API routes return a JSON 404 rather than falling through to the
// single-page app shell, so API clients get a real status.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'not found' });
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Thornwood Trading Co. portal listening on port ${PORT}`);
});
