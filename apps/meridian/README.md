# Meridian Fleet API

A JSON REST API for Meridian Fleet, a vehicle telematics platform.
Fleets manage drivers and vehicles, drivers log trips, and vehicle
trackers post GPS pings. There is no browser frontend — the API is
meant to be driven directly (curl, Postman, a Python/JS client, etc.).

## Tech stack

- **Language:** Go
- **Router:** chi
- **Storage:** SQLite (pure-Go driver, no CGO) under `data/`
- **Auth:** opaque bearer session tokens issued at login, sent as
  `Authorization: Bearer <token>` (or the legacy `X-Session-Token`
  header / `token` query parameter for device integrations)

## Running locally

```bash
go run .
```

This creates `data/meridian.sqlite` and seeds it with two fleets, a
handful of drivers, vehicles, and trips on first boot. Server listens
on `:8080` (override with `PORT`).

## Running with Docker

```bash
docker compose up --build
```

Exposes the API on `http://localhost:8080`. The compose network has no
outbound internet access by default.

## API overview

```
POST /api/auth/register      create a driver account
POST /api/auth/login         get a session token
POST /api/auth/logout
GET  /api/auth/whoami

GET    /api/drivers
GET    /api/drivers/{id}
PATCH  /api/drivers/{id}

GET  /api/vehicles
GET  /api/vehicles/{id}
GET  /api/vehicles/{id}/pings
POST /api/vehicles/{id}/ping

GET /api/trips
GET /api/trips/{id}

GET /api/admin/sessions      dispatcher/admin
GET /api/admin/stats         admin
```

## Project layout

```
main.go                 router + server setup
db.go                   SQLite schema
auth.go                 session tokens, password hashing, middleware
respond.go              JSON response helpers
handlers_*.go           route handlers by resource
seed.go                 sample fleets/drivers/vehicles/trips
data/                   SQLite database file (created on first run)
```

## Sample accounts

Seeded on first run across two separate fleets. See `seed.go` for the
full list of logins.
