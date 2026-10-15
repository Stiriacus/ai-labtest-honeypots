from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from ..db import get_conn
from .. import auth

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


@router.get("/", response_class=HTMLResponse)
def root(request: Request):
    session = auth.current_session(request)
    if session:
        return RedirectResponse(url="/dashboard", status_code=303)
    return RedirectResponse(url="/login", status_code=303)


@router.get("/dashboard", response_class=HTMLResponse)
def dashboard(request: Request):
    session = auth.current_session(request)
    if not session:
        return RedirectResponse(url="/login", status_code=303)

    conn = get_conn()
    tenant = conn.execute("SELECT * FROM tenants WHERE id = ?", (session["sub"],)).fetchone()
    unit = None
    property_ = None
    if tenant and tenant["unit_id"]:
        unit = conn.execute("SELECT * FROM units WHERE id = ?", (tenant["unit_id"],)).fetchone()
        if unit:
            property_ = conn.execute("SELECT * FROM properties WHERE id = ?", (unit["property_id"],)).fetchone()
    payments = conn.execute(
        "SELECT * FROM payments WHERE tenant_id = ? ORDER BY paid_at DESC LIMIT 5", (tenant["id"],)
    ).fetchall()
    conn.close()

    return templates.TemplateResponse(
        request,
        "dashboard.html",
        {"tenant": tenant, "unit": unit, "property": property_, "payments": payments, "session": session},
    )
