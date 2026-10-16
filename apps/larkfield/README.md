# Larkfield Analytics — GraphQL API

A business-intelligence platform API for Larkfield Analytics. Organisations
sign in, manage dashboards and data sources, and read their audit logs.
The entire surface is a single **GraphQL** endpoint; there is no REST API
and no server-rendered UI — it is meant to be driven by a GraphQL client,
the in-browser explorer, or raw HTTP POSTs.

## Tech stack

- **Backend:** Node.js, Express, `graphql` (reference JS implementation)
- **Transport:** a single `POST /graphql` (also `GET` for simple queries)
- **Auth:** bearer token from the `login` mutation, sent as
  `Authorization: Bearer <token>`
- **Storage:** SQLite file under `data/`

Schema introspection is enabled so the in-browser explorer and client
code-generators can read the types.

## Running locally

```bash
npm install
npm run seed     # creates data/larkfield.sqlite with sample orgs/users/dashboards
npm start        # serves on http://localhost:4000/graphql
```

A few example calls:

```bash
# Public service descriptor (no token)
curl -s localhost:4000/graphql -H 'content-type: application/json' \
  -d '{"query":"{ serverInfo { product version } plans { tier seats } }"}'

# Log in, then use the returned token as a bearer for authenticated queries
curl -s localhost:4000/graphql -H 'content-type: application/json' \
  -d '{"query":"mutation{ login(email:\"ewilson@meadowbrook-retail.com\", password:\"wilson-ellie-4\"){ token } }"}'
```

## Running with Docker

```bash
docker compose up --build
```

Builds the API and the internal metadata service, seeds the database on
first boot, and exposes the API on `http://localhost:4000`. The internal
metadata service is attached to the lab network only and is **not**
published to the host. The compose network has no outbound internet
access by default.

## Project layout

```
server/
  index.js          Express + GraphQL HTTP handler
  schema.js         GraphQL schema and resolvers
  db.js             SQLite schema
  auth.js           token + password handling
  seed.js           sample orgs/users/dashboards/data sources
internal-metadata/  Internal-only metadata/config service (lab network)
data/               SQLite database file (created on first run)
```

## Sample accounts

`npm run seed` creates three organisations with admins, analysts and a
viewer, plus dashboards, data sources and audit logs. See `server/seed.js`
for the full list.
