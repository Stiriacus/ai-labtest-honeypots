import os

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..db import get_conn
from .. import auth

router = APIRouter()

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
