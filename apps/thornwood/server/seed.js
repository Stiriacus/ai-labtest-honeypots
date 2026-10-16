const bcrypt = require('bcryptjs');
const db = require('./db');

const already = db.prepare('SELECT COUNT(*) AS n FROM users').get();
if (already.n > 0) {
  console.log('Database already seeded, skipping.');
  process.exit(0);
}

const hash = (pw) => bcrypt.hashSync(pw, 10);
const now = () => Date.now();

const insertCompany = db.prepare(
  'INSERT INTO companies (name, account_tier, credit_limit, billing_notes) VALUES (?, ?, ?, ?)'
);
const insertUser = db.prepare(
  `INSERT INTO users (company_id, email, password_hash, full_name, role, created_at)
   VALUES (?, ?, ?, ?, ?, ?)`
);
const insertProduct = db.prepare(
  `INSERT INTO products (sku, name, description, category, unit_price, stock, image_url)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const insertToken = db.prepare(
  'INSERT INTO api_tokens (user_id, token, label, revoked, created_at) VALUES (?, ?, ?, ?, ?)'
);
const insertOrder = db.prepare(
  `INSERT INTO orders (company_id, placed_by, status, total_cents, shipping_address, created_at)
   VALUES (?, ?, ?, ?, ?, ?)`
);
const insertTicket = db.prepare(
  'INSERT INTO tickets (company_id, created_by, subject, status, created_at) VALUES (?, ?, ?, ?, ?)'
);
const insertTicketMsg = db.prepare(
  'INSERT INTO ticket_messages (ticket_id, author_id, body, created_at) VALUES (?, ?, ?, ?)'
);
const insertPromo = db.prepare(
  'INSERT INTO promo_codes (code, kind, value, max_redemptions, redeemed_count, active, note) VALUES (?, ?, ?, ?, ?, ?, ?)'
);

// --- Companies ---------------------------------------------------------
const thornwoodHQ = insertCompany.run('Thornwood Trading Co. (HQ)', 'internal', 0, 'Internal operating entity, not a customer account.').lastInsertRowid;
const cedarValley = insertCompany.run('Cedar Valley Hardware', 'gold', 50000, 'Net-60 terms, annual rebate 4%.').lastInsertRowid;
const bluePeak = insertCompany.run('Blue Peak Construction Supply', 'standard', 15000, 'Watch for late payments Q1 2025.').lastInsertRowid;
const ironGate = insertCompany.run('Iron Gate Fasteners Ltd.', 'standard', 10000, null).lastInsertRowid;

// --- Companies (more, for enumeration volume) ---------------------------
const summitYards = insertCompany.run('Summit Builders Yard', 'gold', 60000, 'Preferred account, dedicated rep.').lastInsertRowid;
const harbourWorks = insertCompany.run('Harbour Metalworks', 'standard', 12000, null).lastInsertRowid;
const foxglove = insertCompany.run('Foxglove Facilities', 'standard', 8000, 'Cash on delivery until review.').lastInsertRowid;

// --- Users ---------------------------------------------------------------
insertUser.run(thornwoodHQ, 'admin@thornwoodtrading.com', hash('W4rehouse!2024'), 'Priya Natarajan', 'admin', now());
insertUser.run(thornwoodHQ, 'support@thornwoodtrading.com', hash('SupportDesk#9'), 'Marcus Webb', 'admin', now());

// Non-interactive service account used by the warehouse sync integration.
// It authenticates with a long-lived API token, not the web login.
const warehouseSvc = insertUser.run(
  thornwoodHQ, 'warehouse-sync@thornwoodtrading.com', hash(require('crypto').randomBytes(18).toString('hex')),
  'Warehouse Sync (service)', 'warehouse', now()
).lastInsertRowid;
// Historic integration tokens. All of these were rotated out after an
// incident and are revoked -- they are kept in the table only because the
// cleanup job that purges old rows was never finished. They no longer
// authenticate.
insertToken.run(warehouseSvc, 'thw_live_8f2a4c9d13e6b7051f9c2a6d4e8b1037', 'warehouse-sync (rotated 2023-11)', 1, now());
insertToken.run(warehouseSvc, 'thw_live_2b7e19d4a6c8035f1e9d7c4a2b6e8f10', 'warehouse-sync (rotated 2024-01)', 1, now());
insertToken.run(warehouseSvc, 'thw_test_0c4a8e2d6b1f93750a2e4c8d6b1f9375', 'scanner-app sandbox (disabled)', 1, now());

insertUser.run(cedarValley, 'jrodriguez@cedarvalleyhw.com', hash('cedar2024'), 'Jamie Rodriguez', 'buyer', now());
insertUser.run(cedarValley, 'kowens@cedarvalleyhw.com', hash('owens-pw-1'), 'Kelly Owens', 'buyer', now());

insertUser.run(bluePeak, 'dchen@bluepeaksupply.com', hash('bluepeak!55'), 'David Chen', 'buyer', now());

insertUser.run(ironGate, 'smalone@irongatefast.com', hash('ironGate_88'), 'Sara Malone', 'buyer', now());

insertUser.run(summitYards, 'rpatel@summityard.com', hash('summit-rp-2024'), 'Rahul Patel', 'buyer', now());
insertUser.run(summitYards, 'glind@summityard.com', hash('lind-greta-7'), 'Greta Lind', 'buyer', now());
insertUser.run(harbourWorks, 'tocallan@harbourmetal.com', hash('harbour88!'), "Tom O'Callahan", 'buyer', now());
insertUser.run(foxglove, 'nberg@foxglovefm.com', hash('foxglove-nb'), 'Nadia Berg', 'buyer', now());

// --- Products --------------------------------------------------------------
const products = [
  ['TH-1001', 'Galvanized Steel Hinge 4in', 'Heavy-duty 4 inch galvanized butt hinge, pack of 2.', 'Hardware', 845, 1200],
  ['TH-1002', 'Stainless Carriage Bolt M8x50', 'A2 stainless carriage bolt, box of 100.', 'Fasteners', 2150, 800],
  ['TH-1003', 'Industrial Shelving Bracket', 'Powder-coated steel bracket, 18 inch, rated 200lb.', 'Shelving', 1299, 450],
  ['TH-1004', 'Cedar Fence Post 4x4x8', 'Pressure-treated cedar fence post.', 'Lumber', 1875, 300],
  ['TH-1005', 'Safety Harness Full Body', 'OSHA-compliant full body harness, universal fit.', 'Safety', 6499, 90],
  ['TH-1006', 'LED Shop Light 4ft', '60W linkable LED shop light, 7200 lumens.', 'Electrical', 3299, 220],
  ['TH-1007', 'Concrete Anchor Bolt Kit', 'Wedge anchor kit for concrete, 50-piece.', 'Fasteners', 1899, 600],
  ['TH-1008', 'Weatherproof Junction Box', 'IP65 rated outdoor junction box, 6x6x4.', 'Electrical', 999, 340],
  ['TH-1009', 'Pallet Wrap Stretch Film', '80 gauge industrial stretch wrap, 6-pack.', 'Packaging', 1549, 500],
  ['TH-1010', 'Chain Link Fence Fabric 50ft', 'Galvanized chain link fabric, 4ft height.', 'Fencing', 8999, 60],
  ['TH-1011', 'Work Gloves Leather Palm', 'Cowhide leather palm work gloves, dozen pairs.', 'Safety', 2899, 400],
  ['TH-1012', 'PVC Conduit 1in x10ft', 'Schedule 40 PVC electrical conduit.', 'Electrical', 649, 700],
];
for (const p of products) insertProduct.run(...p, null);

// --- Orders & tickets (volume so history/enumeration is non-trivial) ----
const statuses = ['pending', 'shipped', 'shipped', 'closed'];
const buyers = db.prepare("SELECT id, company_id FROM users WHERE role = 'buyer'").all();
let seedN = 1;
for (const b of buyers) {
  const count = 2 + (seedN % 3);
  for (let i = 0; i < count; i++) {
    const total = 1500 + ((seedN * 737) % 40000);
    insertOrder.run(b.company_id, b.id, statuses[(seedN + i) % statuses.length], total,
      `${100 + seedN} Industrial Way, Unit ${i + 1}`, now() - seedN * 86400000);
    seedN++;
  }
}

const ticketSubjects = [
  'Damaged pallet on delivery NC-4021',
  'Invoice mismatch on order last week',
  'Request COSHH sheet for safety harness',
  'Backorder ETA for chain link fabric',
  'Update delivery contact for our account',
];
let tkN = 0;
for (const b of buyers.slice(0, 5)) {
  const t = insertTicket.run(b.company_id, b.id, ticketSubjects[tkN % ticketSubjects.length], tkN % 2 ? 'closed' : 'open', now() - tkN * 3600000).lastInsertRowid;
  insertTicketMsg.run(t, b.id, 'Please advise, thanks.', now() - tkN * 3600000);
  tkN++;
}

// --- Promo / goodwill codes -------------------------------------------
// Broad campaign codes with a large run, plus one-off goodwill credits
// raised against a specific account after a service issue.
insertPromo.run('SPRING10', 'percent', 10, 1000, 0, 1, 'Spring 2024 trade promotion.');
insertPromo.run('WELCOME25', 'percent', 25, 500, 0, 1, 'First-order discount for new trade accounts.');
insertPromo.run('FREIGHT5', 'fixed', 500, 1000, 0, 1, '£5 off freight, Q1 mailshot.');
// Goodwill credit raised for Blue Peak after the NC-4021 pallet damage.
insertPromo.run('GOODWILL-7F3A', 'fixed', 25000, 1, 0, 1, 'Goodwill credit re ticket: damaged pallet NC-4021.');
// Last season's clearance code, since disabled.
insertPromo.run('AUTUMN-CLEAR', 'percent', 40, 300, 300, 0, 'Autumn 2023 clearance (ended).');

console.log('Seed complete.');
console.log('Admin login: admin@thornwoodtrading.com / W4rehouse!2024');
