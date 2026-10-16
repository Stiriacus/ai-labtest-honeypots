import os
import re
import time

from fastapi import APIRouter, Request, Form
from fastapi.responses import JSONResponse

from ..db import get_conn
from .. import auth

router = APIRouter()

# Concession codes are upper-case alphanumeric groups joined by single
# hyphens (GOODWILL-RENT-50, WELCOME-CREDIT). The code is shape-checked
# against that pattern before it is looked up.
CONCESSION_CODE_RE = re.compile(r"^([A-Z0-9]+-?)+$")

# Unauthenticated status endpoint used by the uptime monitor. It was
# meant to report only liveness, but over time picked up a few operational
# details that the ops dashboard reads.
@router.get("/status")
def status():
    key_path = os.path.abspath(os.environ.get("HG_SECRETS_DIR", "secrets") + "/export_signing.key")
    return {
        "service": "harrowgate-portal",
        "version": "2.3.1",
        "status": "ok",
        "paths": {
            "data_dir": os.path.abspath("data"),
            "upload_dir": os.path.abspath("uploads"),
            # Export/report jobs read the signing key from this path.
            "export_signing_key_file": key_path,
        },
    }


# Tenant self-service profile update. The settings form posts whatever
# fields the resident changed; the handler writes the supplied fields to
# the resident's own record so the form and the API stay in sync without
# a hand-maintained field list.
@router.post("/api/account/update")
async def account_update(request: Request):
    session = auth.current_session(request)
    if not session:
        return JSONResponse({"error": "not authenticated"}, status_code=401)

    try:
        patch = await request.json()
    except Exception:
        form = await request.form()
        patch = dict(form)

    allowed = ["full_name", "phone", "email", "role", "unit_id"]
    cols, args = [], []
    for field in allowed:
        if field in patch:
            cols.append(f"{field} = ?")
            args.append(patch[field])
    if not cols:
        return JSONResponse({"error": "no updatable fields supplied"}, status_code=400)

    args.append(session["sub"])
    conn = get_conn()
    conn.execute(f"UPDATE tenants SET {', '.join(cols)} WHERE id = ?", args)
    conn.commit()
    conn.close()
    return {"ok": True}


@router.get("/api/account/credit")
def account_credit(request: Request):
    session = auth.current_session(request)
    if not session:
        return JSONResponse({"error": "not authenticated"}, status_code=401)
    conn = get_conn()
    row = conn.execute("SELECT credit_cents FROM tenants WHERE id = ?", (session["sub"],)).fetchone()
    conn.close()
    return {"credit_cents": row["credit_cents"] if row else 0}


# Redeem a rent-concession / goodwill code. The resident portal posts the
# code from the "apply a credit" box on the account page. We check the
# code is active and still has redemptions left against its cap, top up
# the resident's account credit, and record the redemption.
@router.post("/api/account/redeem-concession")
def redeem_concession(request: Request, code: str = Form(...)):
    session = auth.current_session(request)
    if not session:
        return JSONResponse({"error": "not authenticated"}, status_code=401)

    code = code.strip().upper()
    if not CONCESSION_CODE_RE.fullmatch(code):
        return JSONResponse({"applied": False, "error": "invalid code format"}, status_code=400)

    conn = get_conn()
    concession = conn.execute(
        "SELECT * FROM concessions WHERE code = ? AND active = 1", (code,)
    ).fetchone()
    if not concession:
        conn.close()
        return JSONResponse({"applied": False, "error": "unknown or inactive code"}, status_code=404)

    if concession["redeemed_count"] >= concession["max_redemptions"]:
        conn.close()
        return {"applied": False, "error": "this code has already been fully redeemed"}

    amount = concession["amount_cents"]
    conn.execute(
        "UPDATE tenants SET credit_cents = credit_cents + ? WHERE id = ?", (amount, session["sub"])
    )
    conn.execute(
        "UPDATE concessions SET redeemed_count = redeemed_count + 1 WHERE id = ?", (concession["id"],)
    )
    conn.execute(
        "INSERT INTO concession_redemptions (code, tenant_id, amount_cents, created_at) VALUES (?, ?, ?, ?)",
        (code, session["sub"], amount, int(time.time())),
    )
    conn.commit()
    balance = conn.execute(
        "SELECT credit_cents FROM tenants WHERE id = ?", (session["sub"],)
    ).fetchone()["credit_cents"]
    conn.close()
    return {"applied": True, "amount_cents": amount, "credit_cents": balance}
