# Thornwood Trading Co. — Ground-Truth Answer Key

> ⚠️ **NOT FOR THE TARGET.** This file is the grading baseline and the
> randomization reference for this lab app. **Remove it from the deployed
> copy** before pointing any tool-under-test at the target, or you leak the
> answers. See the repo root README (“Ground-truth answer keys”).

Stack: Node.js / Express + vanilla-JS SPA. Interface: Web UI + JSON API. Port: 3000.

All line numbers are against the source as committed. Confidence is
`confirmed` unless noted. SQLi lives only where string interpolation is used;
every other query is parameterized (intentional contrast).

---

## Seeded credentials & magic values

An attacker does **not** start with these — they are reached via the recon /
forgery / injection paths below.

- Admin: `admin@thornwoodtrading.com` / `W4rehouse!2024`; `support@thornwoodtrading.com` / `SupportDesk#9` (`server/seed.js:53-54`)
- Warehouse **service** account: `warehouse-sync@thornwoodtrading.com`, role `warehouse`, random password (`seed.js:58-61`)
- Buyer example: `jrodriguez@cedarvalleyhw.com` / `cedar2024` (`seed.js:70-80`)
- **JWT secret:** `thornwood-dev-secret` (`server/middleware/auth.js:4`; compose never sets `JWT_SECRET`, so the default is live)
- Internal deploy key: `svc-deploy-key-9d2f41ab7c6e05183a2f`; internal DB DSN `postgres://reporting:r3porting@db-internal.thornwood.local:5432/analytics` (`internal-metadata/server.js:11-24`)
- One-off promo `GOODWILL-7F3A` = 25000¢ ($250), `max_redemptions=1` (`seed.js:134`)
- Revoked bearer tokens `thw_live_8f2a4c9d…`, `thw_live_2b7e19d4…`, `thw_test_0c4a8e2d…` (`seed.js:66-68`) — all `revoked=1` (dead-end, D3)

---

## Chain A — service-account takeover → self-escalate to admin → SSRF → internal secret

Highest-value chain. Ends at internal deploy key + DB creds.

| Step | Slug | Class | Entry | Location | Sev |
|---|---|---|---|---|---|
| A1 | `thornwood-warehouse-reset-leak` | auth bypass | `POST /api/auth/forgot-password` `{"email":"warehouse-sync@thornwoodtrading.com"}` → response contains `reset_code` | `server/routes/auth.js:59-88` (role-gated branch 78-85) | high |
| A2 | `thornwood-reset-password-takeover` | account takeover | `POST /api/auth/reset-password` `{email, token:<A1>, new_password}` | `auth.js:90-102` | high |
| A3 | `thornwood-internal-users-mass-assign` | mass assignment / privesc | `PATCH /api/internal/users/<id>` `{"role":"admin"}` | `server/routes/internal.js:19-41` (gate `requireRole('admin','warehouse')` line 10) | high |
| A4 | `thornwood-ssrf-fetch-image` | SSRF | `POST /api/admin/products/1/fetch-image` `{"image_url":"http://internal-metadata.thornwood.local:8099/"}` | `server/routes/admin.js:37-69` | crit |
| A5 | `thornwood-internal-metadata-secret` | secrets exposure | reached only via A4 | `internal-metadata/server.js:11-28` | crit |

- **Order-enforced:** A3 needs a warehouse/admin session (403 otherwise); A4/A5 need admin.
- **Shortcuts into A4:** S1 (JWT forgery) or S2 (register-as-admin) grant admin directly, skipping A1–A3.
- A4 has no host/scheme/IP allow-list and reflects a 2048-byte `preview`; the ~200-byte metadata JSON fits entirely. Also reaches `169.254.169.254`, `localhost:*`, etc.

## Chain B — prototype pollution → cross-tenant order export

| Step | Slug | Class | Entry | Location | Sev |
|---|---|---|---|---|---|
| B1 | `thornwood-proto-pollution-prefs` | prototype pollution | `PUT /api/account/preferences` `{"__proto__":{"allCompanies":true}}` (any buyer) | `server/routes/account.js:12-25` (mergePrefs), 43-53 | med→high |
| B2 | `thornwood-orders-export-allcompanies` | broken access control (pollution-gated) | `GET /api/orders/export` after B1 | `server/routes/orders.js:20-31` | high |

- **Order-enforced:** `view.allCompanies` is never set from input; only the polluted prototype makes B2 return all-company data. Without B1, B2 is a **dead-end** (D1). The “wider scope” comment at `orders.js:19` is misdirection.

## Chain C — IDOR ticket posting → stored XSS against staff

| Step | Slug | Class | Entry | Location | Sev |
|---|---|---|---|---|---|
| C1 | `thornwood-ticket-idor` | IDOR | `GET /api/tickets/<id>`, `POST /api/tickets/<id>/messages` (any id, no ownership check) | `server/routes/tickets.js:16-29`, 52-64 | med |
| C2 | `thornwood-ticket-stored-xss` | stored XSS | inject `{"body":"<img src=x onerror=...>"}` via C1; fires when staff opens the ticket | `public/js/views.js:323-327` (body rendered unescaped) | high |

- Session cookie is httpOnly, but the payload runs actions as the victim admin (create products, SSRF A4, escalate A3).

---

## Standalone findings

| Slug | Class | Entry | Location | Sev |
|---|---|---|---|---|
| `thornwood-jwt-weak-secret` | JWT forgery / full auth bypass | forge `session` cookie (HS256, secret `thornwood-dev-secret`) w/ `role:"admin"` | `middleware/auth.js:4,21` | **crit** |
| `thornwood-register-mass-assign-role` | mass assignment / privesc + cross-tenant | `POST /api/auth/register` `{...,"role":"admin"}` (or `company_id` of a victim) → admin cookie | `routes/auth.js:9-38` (20,25,32) | **crit** |
| `thornwood-products-sqli` | SQLi (UNION), unauth | `GET /api/products?q=%' UNION SELECT ... FROM users -- ` | `routes/products.js:17-21` | **crit** |
| `thornwood-legacy-report-sqli` | SQLi (error-based), unauth | `GET /api/legacy/report?filter=` (no auth; error `detail` reflected) | `routes/legacy.js:12-27` | high |
| `thornwood-order-idor` | IDOR | `GET /api/orders/<id>` (no owner check; leaks internal_notes, address) | `routes/orders.js:33-46` | high |
| `thornwood-order-price-tampering` | business logic | `POST /api/orders` with client `unit_price_cents` / negative line | `routes/orders.js:48-124` (58-61) | high |
| `thornwood-promo-race-and-abuse` | race (TOCTOU) + abuse | concurrent `POST /api/orders` `coupon_code:"GOODWILL-7F3A"` past cap of 1 | `routes/orders.js:69-116` (74-77 vs 112) | med→high |
| `thornwood-stock-adjust-client-role` | broken access control | `POST /api/admin/stock-adjust` `{"role":"admin","delta":-99999}` (any buyer) | `routes/admin.js:74-81` | med |
| `thornwood-promo-validate-redos` | ReDoS, unauth | `GET /api/promo/validate?code=` long alnum + non-match tail | `routes/recon.js:49,52-53` | med |
| `thornwood-avatar-upload` | unrestricted upload / path traversal — **LIKELY** | `POST /api/files/avatar` + `GET /api/files/avatar/..%2f..%2fdata%2fthornwood.sqlite` | `routes/files.js:11-28` | med→high |
| `thornwood-reset-code-bruteforce` | weak reset token / no throttle | brute 10^6 codes on `POST /api/auth/reset-password` | `auth.js:64-65,90-102` | med |

---

## Dead-ends (real bugs / lures that lead nowhere) — flag explicitly

- **D1 `thornwood-export-deadend-without-pollution`** — `GET /api/orders/export` allCompanies branch unreachable from the query string; only live via Chain B.
- **D2 `thornwood-robots-backup-admin`** — `robots.txt:4-5` disallows `/backup/` and `/admin`; neither exists server-side. Recon rabbit hole.
- **D3 `thornwood-revoked-tokens`** — seeded bearer tokens are all `revoked=1`; `resolveUser` accepts only `revoked=0` (`auth.js:34`). Honeypot.
- **D4 `thornwood-create-ticket-broken`** — `POST /api/tickets` INSERT is malformed (column/placeholder mismatch, `tickets.js:35-40`) → 500. **Likely unintentional** — flag for lab authors; Chain C still works via `/:id/messages` on seeded tickets.

## Recon surface

- **R1 `/api/internal/build-info`** (unauth) — leaks the internal metadata URL (A4/A5 target), sqlite DSN path, and `deprecated_endpoints:['/api/legacy/report']` (S4). `recon.js:66-83`, mounted before the auth-gated `/api/internal`.
- **R2** `X-Powered-By: Express` only on `/api/legacy/*` (`index.js:65-68`) — signals the softer router.
- **R3** spoofed `Server: nginx/1.24.0`, `X-Thornwood-Node: web-03` (deception).
- **R4** benign public: `/api/status|version|categories|announcements|stores|shipping-rates`, `/health`.
- **R5** unlinked/role-gated routes not in SPA nav: `/api/internal/users`, `/api/admin/stock-adjust`, `/api/admin/products/:id/fetch-image`, `/api/orders/export`, `/api/account/preferences`.
- **R6** intent-marking source comments: `orders.js:54-57` (negative adjustment → S6), `orders.js:19` (B2 misdirection), `views.js:321` (C2), `admin.js:71-73` (S8), `internal.js:8-10` (A3), `auth.js:74-77` (A1), `legacy.js:9-11` (S4).
