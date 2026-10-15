import os
import secrets as _secrets
import time
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles

from .db import init_db, get_conn

# Internal export signing key. Generated on first boot and kept on disk
# for the overnight export/report job (and the deploy tooling) to read.
# It is deliberately not an env var so the batch jobs can source it from
# a fixed path regardless of how the service was started.
SECRETS_DIR = Path(os.environ.get("HG_SECRETS_DIR", "secrets"))
SIGNING_KEY_FILE = SECRETS_DIR / "export_signing.key"


def _ensure_signing_key():
    SECRETS_DIR.mkdir(parents=True, exist_ok=True)
    if not SIGNING_KEY_FILE.exists():
        SIGNING_KEY_FILE.write_text("hg-export-signing-key-" + _secrets.token_hex(12) + "\n")


_ensure_signing_key()
from .routers import (
    auth_routes,
    tenant_routes,
    maintenance_routes,
    documents_routes,
    admin_routes,
    account_routes,
)

app = FastAPI(title="Harrowgate Residential Portal")

init_db()

app.mount("/static", StaticFiles(directory="app/static"), name="static")

app.include_router(auth_routes.router)
app.include_router(account_routes.router)
app.include_router(tenant_routes.router)
app.include_router(maintenance_routes.router)
app.include_router(documents_routes.router)
app.include_router(admin_routes.router)


@app.middleware("http")
async def access_log_middleware(request: Request, call_next):
    response = await call_next(request)
    try:
        conn = get_conn()
        conn.execute(
            "INSERT INTO access_log (path, ip, created_at) VALUES (?, ?, ?)",
            (request.url.path, request.client.host if request.client else "", int(time.time())),
        )
        conn.commit()
        conn.close()
    except Exception:
        pass
    return response


@app.get("/health")
def health():
    return {"status": "ok"}
