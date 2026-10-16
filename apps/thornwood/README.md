# Thornwood Trading Co. — Wholesale Portal

A B2B ordering portal for Thornwood Trading Co. Registered trade accounts can
browse the catalog, place orders, review order history, and raise support
tickets with the Thornwood team. An internal admin area handles company
accounts, order oversight, and catalog management.

In production the portal runs behind an nginx reverse proxy and talks to a
few internal-only backend services over the service mesh (an asset fetcher
for supplier product images, an internal metadata/config endpoint, and a
legacy reporting integration still consumed by an overnight cron). Machine
clients such as the warehouse-sync job authenticate with long-lived API
tokens rather than the interactive web login.

## Tech stack

- **Backend:** Node.js, Express, better-sqlite3
- **Auth:** JWT in an HTTP-only cookie for interactive users; bearer API
  tokens for machine/integration clients
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

This builds the portal image and the internal metadata service, seeds the
database on first boot, and exposes the portal on `http://localhost:3000`.
The internal metadata service is attached to the lab network only and is
**not** published to the host. The compose network has no outbound
internet access by default.

## Project layout

```
server/            Express app, routes, and SQLite access
  routes/           auth, products, orders, tickets, admin, files,
                     recon (public/status), legacy (reporting cron), internal
  middleware/        session + API-token handling
public/             Static frontend (HTML/CSS/vanilla JS), robots.txt, sitemap
internal-metadata/  Internal-only metadata/config service (lab network)
data/               SQLite database file (created on first run)
uploads/avatars/    User-uploaded profile images
```

## Sample accounts

Running `npm run seed` creates a handful of companies and users across
different account tiers so the catalog, order history, and support desk all
have realistic data to browse. See `server/seed.js` for the full list.
