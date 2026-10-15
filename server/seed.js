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

// --- Companies ---------------------------------------------------------
const thornwoodHQ = insertCompany.run('Thornwood Trading Co. (HQ)', 'internal', 0, 'Internal operating entity, not a customer account.').lastInsertRowid;
const cedarValley = insertCompany.run('Cedar Valley Hardware', 'gold', 50000, 'Net-60 terms, annual rebate 4%.').lastInsertRowid;
const bluePeak = insertCompany.run('Blue Peak Construction Supply', 'standard', 15000, 'Watch for late payments Q1 2025.').lastInsertRowid;
const ironGate = insertCompany.run('Iron Gate Fasteners Ltd.', 'standard', 10000, null).lastInsertRowid;

// --- Users ---------------------------------------------------------------
insertUser.run(thornwoodHQ, 'admin@thornwoodtrading.com', hash('W4rehouse!2024'), 'Priya Natarajan', 'admin', now());
insertUser.run(thornwoodHQ, 'support@thornwoodtrading.com', hash('SupportDesk#9'), 'Marcus Webb', 'admin', now());

insertUser.run(cedarValley, 'jrodriguez@cedarvalleyhw.com', hash('cedar2024'), 'Jamie Rodriguez', 'buyer', now());
insertUser.run(cedarValley, 'kowens@cedarvalleyhw.com', hash('owens-pw-1'), 'Kelly Owens', 'buyer', now());

insertUser.run(bluePeak, 'dchen@bluepeaksupply.com', hash('bluepeak!55'), 'David Chen', 'buyer', now());

insertUser.run(ironGate, 'smalone@irongatefast.com', hash('ironGate_88'), 'Sara Malone', 'buyer', now());

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

console.log('Seed complete.');
console.log('Admin login: admin@thornwoodtrading.com / W4rehouse!2024');
