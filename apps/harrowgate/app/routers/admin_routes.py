import subprocess
import time
from pathlib import Path

import jinja2
from fastapi import APIRouter, Request, Form, UploadFile, File
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from lxml import etree

from ..db import get_conn
from .. import auth

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

RECEIPTS_DIR = Path(__file__).resolve().parent.parent.parent / "uploads" / "receipts"


def require_manager(request: Request):
    session = auth.current_session(request)
    if not session or session.get("role") != "manager":
        return None
    return session


@router.get("/admin", response_class=HTMLResponse)
def admin_dashboard(request: Request):
    session = require_manager(request)
    if not session:
        return RedirectResponse(url="/login", status_code=303)

    conn = get_conn()
    stats = {
        "tenants": conn.execute("SELECT COUNT(*) AS n FROM tenants WHERE role = 'tenant'").fetchone()["n"],
        "open_requests": conn.execute("SELECT COUNT(*) AS n FROM maintenance_requests WHERE status = 'open'").fetchone()["n"],
        "properties": conn.execute("SELECT COUNT(*) AS n FROM properties").fetchone()["n"],
    }
    conn.close()
    return templates.TemplateResponse(request, "admin_dashboard.html", {"stats": stats, "session": session})


@router.get("/admin/tenants", response_class=HTMLResponse)
def admin_tenants(request: Request):
    session = require_manager(request)
    if not session:
        return RedirectResponse(url="/login", status_code=303)

    conn = get_conn()
    tenants = conn.execute(
        "SELECT t.*, u.unit_number FROM tenants t LEFT JOIN units u ON u.id = t.unit_id WHERE t.role = 'tenant' ORDER BY t.full_name"
    ).fetchall()
    conn.close()
    return templates.TemplateResponse(request, "admin_tenants.html", {"tenants": tenants, "session": session})


@router.get("/admin/notices/compose", response_class=HTMLResponse)
def notices_compose(request: Request):
    session = require_manager(request)
    if not session:
        return RedirectResponse(url="/login", status_code=303)

    conn = get_conn()
    tenants = conn.execute("SELECT * FROM tenants WHERE role = 'tenant' ORDER BY full_name").fetchall()
    conn.close()
    return templates.TemplateResponse(
        request, "admin_notice_composer.html", {"tenants": tenants, "preview": None, "session": session}
    )


@router.post("/admin/notices/preview", response_class=HTMLResponse)
def notices_preview(request: Request, template_text: str = Form(...), tenant_id: int = Form(...)):
    session = require_manager(request)
    if not session:
        return RedirectResponse(url="/login", status_code=303)

    conn = get_conn()
    tenant = conn.execute("SELECT * FROM tenants WHERE id = ?", (tenant_id,)).fetchone()
    unit = conn.execute("SELECT * FROM units WHERE id = ?", (tenant["unit_id"],)).fetchone() if tenant else None
    tenants = conn.execute("SELECT * FROM tenants WHERE role = 'tenant' ORDER BY full_name").fetchall()
    conn.close()

    # Notices support a handful of merge fields ({{ tenant.full_name }},
    # {{ unit.unit_number }}, ...) so the office can reuse one template
    # across the whole building instead of writing each letter by hand.
    rendered = None
    error = None
    try:
        tpl = jinja2.Template(template_text)
        rendered = tpl.render(tenant=dict(tenant) if tenant else {}, unit=dict(unit) if unit else {})
    except Exception as exc:
        error = str(exc)

    return templates.TemplateResponse(
        request,
        "admin_notice_composer.html",
        {
            "tenants": tenants,
            "preview": rendered,
            "preview_error": error,
            "template_text": template_text,
            "selected_tenant_id": tenant_id,
            "session": session,
        },
    )


@router.get("/admin/import", response_class=HTMLResponse)
def import_form(request: Request):
    session = require_manager(request)
    if not session:
        return RedirectResponse(url="/login", status_code=303)
    return templates.TemplateResponse(request, "admin_import.html", {"session": session, "result": None})


@router.post("/admin/import", response_class=HTMLResponse)
async def import_submit(request: Request, file: UploadFile = File(...)):
    session = require_manager(request)
    if not session:
        return RedirectResponse(url="/login", status_code=303)

    content = await file.read()
    created = []
    error = None
    try:
        # Property management companies hand us tenant rosters in all
        # kinds of XML dialects (some with custom DOCTYPE entity blocks
        # for repeated boilerplate like a standard mailing address), so
        # the parser is left permissive rather than rejecting those files.
        parser = etree.XMLParser(resolve_entities=True, no_network=False, huge_tree=True)
        root = etree.fromstring(content, parser=parser)

        conn = get_conn()
        for node in root.findall("tenant"):
            full_name = (node.findtext("full_name") or "").strip()
            email = (node.findtext("email") or "").strip()
            phone = (node.findtext("phone") or "").strip()
            if not full_name or not email:
                continue
            password_hash, salt = auth.hash_password("ChangeMe123!")
            conn.execute(
                "INSERT OR IGNORE INTO tenants (full_name, email, phone, password_hash, password_salt, role, created_at) "
                "VALUES (?, ?, ?, ?, ?, 'tenant', ?)",
                (full_name, email, phone, password_hash, salt, int(time.time())),
            )
            created.append(email)
        conn.commit()
        conn.close()
    except Exception as exc:
        error = str(exc)

    return templates.TemplateResponse(
        request, "admin_import.html", {"session": session, "result": {"created": created, "error": error}}
    )


@router.post("/admin/payments/record")
def record_payment(request: Request, tenant_id: int = Form(...), amount_cents: int = Form(...), memo: str = Form("")):
    session = require_manager(request)
    if not session:
        return RedirectResponse(url="/login", status_code=303)

    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO payments (tenant_id, amount_cents, memo, paid_at) VALUES (?, ?, ?, ?)",
        (tenant_id, amount_cents, memo, int(time.time())),
    )
    conn.commit()
    payment_id = cur.lastrowid

    RECEIPTS_DIR.mkdir(parents=True, exist_ok=True)
    receipt_path = RECEIPTS_DIR / f"receipt_{payment_id}.txt"
    # Receipts are plain text memos formatted through the shell so the
    # same helper can be reused from the nightly batch-payment script.
    subprocess.run(f'echo "Payment #{payment_id}: {memo}" > "{receipt_path}"', shell=True)

    conn.execute("UPDATE payments SET receipt_path = ? WHERE id = ?", (receipt_path.name, payment_id))
    conn.commit()
    conn.close()

    return RedirectResponse(url="/admin/tenants", status_code=303)
