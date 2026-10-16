# Meridian Fleet API — Ground-Truth Answer Key

> ⚠️ **NOT FOR THE TARGET.** This file is the grading baseline and the
> randomization reference for this lab app. **Remove it from the deployed
> copy** before pointing any tool-under-test at the target, or you leak the
> answers. See the repo root README (“Ground-truth answer keys”).

Stack: Go / chi. Interface: JSON API only (headless). Port: 8080.

All line numbers are against the source as committed. Confidence is
`confirmed` unless noted.

**Auth model:** `requireAuth` (any valid session) vs `requireRole(...)` (checks
`Driver.Role` only, never fleet). Data is partitioned by `fleet_id`; LIST
endpoints scope by the caller’s fleet, several GET-by-id / PATCH / POST do not
— that is the IDOR/BOLA theme. No SQLi anywhere (all `?`-parameterized;
`handleUpdateDriver`’s dynamic SQL uses a fixed column allow-list → mass
assignment, **not** injection).

---

## Seeded credentials & magic values

- Fleet A (id 1, Northside Courier): admin `admin@northsidecourier.com` / `Northside#Ops9`; dispatcher `dispatch@northsidecourier.com` / `dispatch-north-1`; drivers `jkowalski@northsidecourier.com` / `kowalski88`, `amendes@northsidecourier.com` / `mendes-amara-7`
- Fleet B (id 2, Bayshore Logistics): admin `admin@bayshorelogistics.com` / `BayshoreAdmin!3`; driver `lmoreau@bayshorelogistics.com` / `moreau-lea-5`
- Logins echoed to stdout at `seed.go:127-129`
- Bonus codes (`seed.go:104-116`): `ONBOARD-2024` (fleetA, 5000¢, max 500), `REFER-A-DRIVER` (fleetA, 10000¢, max 50), **`REFERRAL-Q1-TOP` (fleetA, 150000¢ / $1,500, max 1 — race target)**, `WINTER22-DONE` (fleetB, inactive)
- Internal secrets (`internal-metadata/server.js`): `provider_api_key` = `mrd-provider-api-key-5c1e8a3f0d9b2746`; `callback_hmac` = `whsec_2f9c4a6e8d1b05734a2c6e8f`

---

## Chain 1 — unauth → admin → SSRF → internal secret (headline)

| Step | Slug | Class | Entry | Location | Sev |
|---|---|---|---|---|---|
| 0 (recon) | `meridian-infoleak-meta` | info / SSRF-target leak | `GET /api/meta` (unauth) → `metadata: http://provider-metadata.meridian.local:8099/` | `handlers_meta.go:9-21` | info |
| 1a | `meridian-massassign-register-role` | mass assignment / privesc | `POST /api/auth/register` `{...,"role":"admin","fleet_id":1}` (unauth) → token | `handlers_auth.go:38-46` | high→crit |
| 1b | `meridian-bola-massassign-driver-patch` | BOLA + mass assign + privesc | `PATCH /api/drivers/{id}` `{"role":"admin"}` (any session, any id) | `handlers_drivers.go:67-112` (allow-list incl. role/fleet_id/pay_rate_cents at 88) | crit |
| 2 | `meridian-ssrf-providersync` | SSRF | `POST /api/admin/provider-sync` `{"source_url":"http://provider-metadata.meridian.local:8099/"}` | `handlers_providersync.go:19-43` (echoes 8192-byte preview) | crit |
| 3 | `meridian-secrets-metadata-service` | secrets exposure | reached only via SSRF | `internal-metadata/server.js:8-9,13-24` | crit |

- **Order-enforced:** Step 2 is gated by `requireRole("admin")` (`main.go:90-93`); Step 1 unlocks it. Step 0 is open to anyone.

## Chain 2 — dispatcher → cross-tenant session-token harvest → admin takeover

| Step | Slug | Class | Entry | Location | Sev |
|---|---|---|---|---|---|
| 1 | `meridian-massassign-register-dispatcher` | mass assignment | `POST /api/auth/register` `{...,"role":"dispatcher"}` (unauth) | `handlers_auth.go:38-46` | high |
| 2 | `meridian-authz-admin-sessions-token-leak` | broken access control + token exposure (cross-tenant) | `GET /api/admin/sessions` → raw `token` for all sessions/all fleets | `handlers_admin.go:13-38` (query 15-18, returns token 30-33) | crit |

- **Order-enforced:** gated by `requireRole("admin","dispatcher")` (`main.go:85-88`) — a lower-trust **dispatcher** can read **admin** tokens, replay them (tokens never expire), and take over.

---

## Standalone findings

| Slug | Class | Entry | Location | Sev |
|---|---|---|---|---|
| `meridian-bola-driver-get` | IDOR / cross-tenant PII + salary | `GET /api/drivers/{id}` (no fleet scope) | `handlers_drivers.go:37-64` | med→high |
| `meridian-bola-vehicle-get` | IDOR | `GET /api/vehicles/{id}` | `handlers_vehicles.go:33-52` | med |
| `meridian-bola-vehicle-pings` | IDOR / GPS tracking leak | `GET /api/vehicles/{id}/pings` | `handlers_vehicles.go:54-83` | med→high |
| `meridian-bola-vehicle-ping-post` | broken access control / integrity | `POST /api/vehicles/{id}/ping` (forge GPS for any vehicle) | `handlers_vehicles.go:91-115` | med |
| `meridian-bola-trip-get` | IDOR | `GET /api/trips/{id}` | `handlers_trips.go:39-67` | med |
| `meridian-race-bonus-redeem` | race (TOCTOU) + business logic (no per-driver dedup) | concurrent `POST /api/bonus/redeem` `{"code":"REFERRAL-Q1-TOP"}` | `handlers_bonus.go:54-98` (check 73-79 vs credit/incr 82-89) | med→high |
| `meridian-weak-session-token` | predictable token | token = `base64url("driverID:unixSeconds:seq%10000")`; brute 4-digit seq | `auth.go:27-37` | med→high (forgeability **likely**) |
| `meridian-no-session-expiry` | session mgmt | captured token valid indefinitely | `auth.go:79-109` | low→med |

---

## Dead-ends — flag explicitly

- **`meridian-logout-noop`** — `handleLogout` deletes nothing; session survives logout (`handlers_auth.go:99-106`). Real bug, no privilege gain alone.
- **`meridian-xff-ip-spoof`** — `clientIP` trusts `X-Forwarded-For` verbatim into `sessions.ip` (`auth.go:58-63`); only corrupts the audit IP shown in `/api/admin/sessions`.
- **`handleAdminStats`** (`handlers_admin.go:40-62`) — correctly fleet-scoped; **not** a vuln (confirms it was checked).
- **Not SQLi:** `handleUpdateDriver` dynamic SQL uses the fixed column list at `handlers_drivers.go:88`, values parameterized.

## Recon surface

- Unauth (`main.go:45-55`): `GET /healthz`; **`GET /api/meta`** → leaks internal metadata URL (Chain 1 step 0); `GET /api/status|regions|plans|vehicle-types` (benign, `handlers_recon.go:9-31`).
- Response middleware spoofs `Server: nginx/1.25.4`, `X-Meridian-Node: api-01` (`main.go:32-38`) — decoy.
- No hidden/leftover routes; every handler is wired in `main.go`, matching `README.md:40-66`.
- Internal SSRF target `internal-metadata/server.js` (port 8099, alias `provider-metadata.meridian.local`) is `internal: true`, not host-published — reachable **only** via the provider-sync SSRF.
- Pre-seeded DB at `data/meridian.sqlite` (binary; contains the seed rows).
