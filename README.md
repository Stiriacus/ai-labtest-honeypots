# Thornwood Trading Co. — Wholesale Portal

A B2B ordering portal for Thornwood Trading Co. Registered trade accounts can
browse the catalog, place orders, review order history, and raise support
tickets with the Thornwood team. An internal admin area handles company
accounts, order oversight, and catalog management.

## Tech stack

- **Backend:** Node.js, Express, better-sqlite3
- **Auth:** JWT stored in an HTTP-only cookie
- **Frontend:** Vanilla JS single-page app (hash routing, no build step)
- **Storage:** SQLite file under `data/`, uploaded avatars under `uploads/`

## Running locally

```bash
npm install
npm run seed     # creates data/thornwood.sqlite with sample companies/products
npm start        # serves on http://localhost:3000
```

Set `JWT_SECRET` and `PORT` as environment variables to override the
defaults used in local development.

## Running with Docker

```bash
docker compose up --build
```

This builds the app image, seeds the database on first boot, and exposes
the portal on `http://localhost:3000`. The compose network has no outbound
internet access by default.

## Project layout

```
server/            Express app, routes, and SQLite access
  routes/           auth, products, orders, tickets, admin, files
  middleware/        JWT session handling
public/             Static frontend (HTML/CSS/vanilla JS)
data/               SQLite database file (created on first run)
uploads/avatars/    User-uploaded profile images
```

## Sample accounts

Running `npm run seed` creates a handful of companies and users across
different account tiers so the catalog, order history, and support desk all
have realistic data to browse. See `server/seed.js` for the full list.
