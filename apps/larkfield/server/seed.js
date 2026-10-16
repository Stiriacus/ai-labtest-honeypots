const db = require('./db');
const auth = require('./auth');

const already = db.prepare('SELECT COUNT(*) AS n FROM users').get();
if (already.n > 0) {
  console.log('Database already seeded, skipping.');
  process.exit(0);
}

const now = Date.now();
const org = db.prepare('INSERT INTO orgs (name, plan) VALUES (?, ?)');
const user = db.prepare(
  'INSERT INTO users (org_id, email, password_hash, full_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)'
);
const dash = db.prepare('INSERT INTO dashboards (org_id, name, visibility) VALUES (?, ?, ?)');
const ds = db.prepare('INSERT INTO data_sources (org_id, name, kind, last_sync_url) VALUES (?, ?, ?, ?)');
const log = db.prepare('INSERT INTO audit_logs (org_id, actor, action, created_at) VALUES (?, ?, ?, ?)');

const orgA = org.run('Meadowbrook Retail Group', 'business').lastInsertRowid;
const orgB = org.run('Tollgate Manufacturing', 'team').lastInsertRowid;
const orgC = org.run('Verity Health Partners', 'enterprise').lastInsertRowid;

const h = (pw) => auth.hashPassword(pw);

// Org A — includes the supplied analyst test account and an admin.
user.run(orgA, 'admin@meadowbrook-retail.com', h('Meadow!Admin7'), 'Diane Okoro', 'admin', now);
user.run(orgA, 'ewilson@meadowbrook-retail.com', h('wilson-ellie-4'), 'Ellie Wilson', 'analyst', now);
user.run(orgA, 'rkhan@meadowbrook-retail.com', h('khan2024!'), 'Rashid Khan', 'analyst', now);
user.run(orgA, 'viewer@meadowbrook-retail.com', h('view-only-9'), 'Guest Viewer', 'viewer', now);

// Other orgs — cross-org data that a scoping flaw would expose.
user.run(orgB, 'admin@tollgate-mfg.com', h('Tollgate#Ops3'), 'Martin Vogel', 'admin', now);
user.run(orgB, 'panders@tollgate-mfg.com', h('anders-paula'), 'Paula Anders', 'analyst', now);
user.run(orgC, 'admin@verityhealth.example', h('Verity$Sec11'), 'Dr. Aisha Rahman', 'admin', now);
user.run(orgC, 'jlindqvist@verityhealth.example', h('lindqvist-7'), 'Johan Lindqvist', 'analyst', now);

for (const [o, names] of [
  [orgA, ['Q4 Sales', 'Store Footfall', 'Returns Analysis', 'Marketing Spend']],
  [orgB, ['Line Throughput', 'Defect Rates']],
  [orgC, ['Patient Flow', 'Staffing Levels', 'Bed Occupancy']],
]) {
  names.forEach((n, i) => dash.run(o, n, i % 3 === 0 ? 'org' : 'private'));
}

ds.run(orgA, 'Warehouse Postgres', 'postgres', null);
ds.run(orgA, 'Shopify Export', 'http', 'https://data.meadowbrook-retail.com/exports/latest.csv');
ds.run(orgB, 'MES Feed', 'http', 'https://mes.tollgate-mfg.com/feed');
ds.run(orgC, 'EHR Extract', 'sftp', null);

for (let i = 0; i < 20; i++) {
  log.run(orgA, 'ewilson@meadowbrook-retail.com', `viewed dashboard ${1 + (i % 4)}`, now - i * 3600000);
}
log.run(orgB, 'panders@tollgate-mfg.com', 'exported report', now - 7200000);
log.run(orgC, 'jlindqvist@verityhealth.example', 'scheduled refresh', now - 5400000);

// Outstanding seat invitations. Each is single-use and carries the role
// the colleague will be provisioned with.
const invite = db.prepare(
  'INSERT INTO invites (code, org_id, role, email_hint, redeemed, created_at) VALUES (?, ?, ?, ?, ?, ?)'
);
invite.run('INV-MEADOW-A1', orgA, 'analyst', 'new.analyst@meadowbrook-retail.com', 0, now);
invite.run('INV-MEADOW-ADMIN', orgA, 'admin', 'ops.lead@meadowbrook-retail.com', 0, now);
invite.run('INV-TOLLGATE-7', orgB, 'analyst', 'contractor@tollgate-mfg.com', 0, now);
// Already-used invite kept for the audit trail.
invite.run('INV-VERITY-OLD', orgC, 'analyst', 'former.temp@verityhealth.example', 1, now - 30 * 86400000);

console.log('Seed complete.');
console.log('Analyst login (mutation): ewilson@meadowbrook-retail.com / wilson-ellie-4');
