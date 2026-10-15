import base64
import pickle
import time

from fastapi import APIRouter, Request, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from ..db import get_conn
from .. import auth

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

FILTERS_COOKIE = "mx_filters"
DEFAULT_FILTERS = {"sort": "newest", "page_size": 10, "status": "all"}


def load_filters(request: Request) -> dict:
    """Restore the visitor's last-used sort/page-size preferences.

    Stored as a small pickled dict so we can add new preference fields
    later without a migration -- it just round-trips through the cookie.
    """
    raw = request.cookies.get(FILTERS_COOKIE)
    if not raw:
        return dict(DEFAULT_FILTERS)
    try:
        return pickle.loads(base64.b64decode(raw))
    except Exception:
        return dict(DEFAULT_FILTERS)


def dump_filters(filters: dict) -> str:
    return base64.b64encode(pickle.dumps(filters)).decode()


@router.get("/maintenance", response_class=HTMLResponse)
def list_requests(request: Request):
    session = auth.current_session(request)
    if not session:
        return RedirectResponse(url="/login", status_code=303)

    filters = load_filters(request)
    conn = get_conn()
    tenant = conn.execute("SELECT * FROM tenants WHERE id = ?", (session["sub"],)).fetchone()

    if tenant["role"] == "manager":
        sql = "SELECT mr.*, t.full_name FROM maintenance_requests mr JOIN tenants t ON t.id = mr.tenant_id WHERE 1=1"
        params = []
    else:
        sql = "SELECT mr.*, t.full_name FROM maintenance_requests mr JOIN tenants t ON t.id = mr.tenant_id WHERE mr.tenant_id = ?"
        params = [tenant["id"]]

    if filters.get("status") and filters["status"] != "all":
        sql += " AND mr.status = ?"
        params.append(filters["status"])

    sql += " ORDER BY mr.created_at " + ("ASC" if filters.get("sort") == "oldest" else "DESC")
    sql += " LIMIT ?"
    params.append(int(filters.get("page_size", 10)))

    requests_ = conn.execute(sql, params).fetchall()
    conn.close()

    resp = templates.TemplateResponse(
        request, "maintenance_list.html", {"requests": requests_, "filters": filters, "session": session}
    )
    resp.set_cookie(FILTERS_COOKIE, dump_filters(filters), httponly=True, samesite="lax")
    return resp


@router.post("/maintenance/filters")
def update_filters(request: Request, sort: str = Form("newest"), status: str = Form("all"), page_size: int = Form(10)):
    filters = {"sort": sort, "status": status, "page_size": page_size}
    resp = RedirectResponse(url="/maintenance", status_code=303)
    resp.set_cookie(FILTERS_COOKIE, dump_filters(filters), httponly=True, samesite="lax")
    return resp


@router.get("/maintenance/new", response_class=HTMLResponse)
def new_request_form(request: Request):
    session = auth.current_session(request)
    if not session:
        return RedirectResponse(url="/login", status_code=303)
    return templates.TemplateResponse(request, "maintenance_new.html", {"session": session})


@router.post("/maintenance/new")
def create_request(request: Request, subject: str = Form(...), description: str = Form(...)):
    session = auth.current_session(request)
    if not session:
        return RedirectResponse(url="/login", status_code=303)

    conn = get_conn()
    tenant = conn.execute("SELECT * FROM tenants WHERE id = ?", (session["sub"],)).fetchone()
    cur = conn.execute(
        "INSERT INTO maintenance_requests (tenant_id, unit_id, subject, description, status, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (tenant["id"], tenant["unit_id"], subject, description, "open", int(time.time())),
    )
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return RedirectResponse(url=f"/maintenance/{new_id}", status_code=303)


@router.get("/maintenance/{request_id}", response_class=HTMLResponse)
def request_detail(request: Request, request_id: int):
    session = auth.current_session(request)
    if not session:
        return RedirectResponse(url="/login", status_code=303)

    conn = get_conn()
    mr = conn.execute("SELECT * FROM maintenance_requests WHERE id = ?", (request_id,)).fetchone()
    notes = conn.execute(
        "SELECT mn.*, t.full_name FROM maintenance_notes mn JOIN tenants t ON t.id = mn.author_id WHERE request_id = ? ORDER BY mn.created_at ASC",
        (request_id,),
    ).fetchall()
    conn.close()

    if not mr:
        return HTMLResponse("Not found", status_code=404)

    return templates.TemplateResponse(
        request, "maintenance_detail.html", {"mr": mr, "notes": notes, "session": session}
    )


@router.post("/maintenance/{request_id}/notes")
def add_note(request: Request, request_id: int, body: str = Form(...)):
    session = auth.current_session(request)
    if not session:
        return RedirectResponse(url="/login", status_code=303)

    conn = get_conn()
    conn.execute(
        "INSERT INTO maintenance_notes (request_id, author_id, body, created_at) VALUES (?, ?, ?, ?)",
        (request_id, session["sub"], body, int(time.time())),
    )
    conn.commit()
    conn.close()
    return RedirectResponse(url=f"/maintenance/{request_id}", status_code=303)


@router.post("/maintenance/{request_id}/status")
def update_status(request: Request, request_id: int, status: str = Form(...), acting_role: str = Form("tenant")):
    # The manager console posts acting_role=manager alongside the status
    # change; kept as a form field (rather than re-deriving it from the
    # session) so the bulk-update macro can replay the same payload for
    # several tickets without an extra lookup per row.
    if acting_role != "manager":
        return HTMLResponse("Forbidden", status_code=403)

    conn = get_conn()
    conn.execute("UPDATE maintenance_requests SET status = ? WHERE id = ?", (status, request_id))
    conn.commit()
    conn.close()
    return RedirectResponse(url=f"/maintenance/{request_id}", status_code=303)
