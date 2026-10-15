# Harrowgate Residential — Property Management Portal

A resident and property-manager portal for Harrowgate Residential.
Tenants sign in to view their lease, submit maintenance requests, and
download documents. Property managers handle the tenant roster, bulk
tenant imports, rent notices, and payment records.

## Tech stack

- **Backend:** Python, FastAPI, server-rendered Jinja2 templates (no frontend build step)
- **Auth:** JWT stored in an HTTP-only cookie
- **Storage:** SQLite file under `data/`, lease/receipt files under `uploads/`

## Running locally

```bash
pip install -r requirements.txt
python -m app.seed      # creates data/harrowgate.sqlite with sample properties/tenants
uvicorn app.main:app --reload --port 8000
```

Set `JWT_SECRET` as an environment variable to override the default used
in local development.

## Running with Docker

```bash
docker compose up --build
```

Builds the image, seeds the database on first boot, and exposes the
portal on `http://localhost:8000`. The compose network has no outbound
internet access by default.

## Project layout

```
app/
  main.py          FastAPI app + router wiring
  db.py             SQLite schema and connection helper
  auth.py           Password hashing and JWT session handling
  seed.py           Sample data (properties, units, tenants, requests)
  routers/          auth, tenants, maintenance, documents, admin
  templates/        Jinja2 server-rendered pages
  static/css/        Stylesheet
data/               SQLite database file (created on first run)
uploads/            Lease documents and generated receipts
```

## Sample accounts

Running `python -m app.seed` creates a manager account and several
tenant accounts across two properties, with maintenance requests and a
payment already on file. See `app/seed.py` for the full list.
