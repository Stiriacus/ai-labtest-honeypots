from fastapi import APIRouter, Request, Form
from fastapi.responses import RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates

from ..db import get_conn
from .. import auth

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


@router.get("/login", response_class=HTMLResponse)
def login_form(request: Request):
    return templates.TemplateResponse(request, "login.html", {"error": None})


@router.post("/login")
def login_submit(request: Request, email: str = Form(...), password: str = Form(...)):
    conn = get_conn()
    tenant = conn.execute("SELECT * FROM tenants WHERE email = ?", (email,)).fetchone()
    conn.close()

    if not tenant or not auth.verify_password(password, tenant["password_salt"], tenant["password_hash"]):
        return templates.TemplateResponse(
            request, "login.html", {"error": "Invalid email or password"}, status_code=401
        )

    token = auth.issue_session(tenant)
    resp = RedirectResponse(url="/dashboard", status_code=303)
    resp.set_cookie(auth.SESSION_COOKIE, token, httponly=True, samesite="lax")
    return resp


@router.get("/logout")
def logout():
    resp = RedirectResponse(url="/login", status_code=303)
    resp.delete_cookie(auth.SESSION_COOKIE)
    resp.delete_cookie("mx_filters")
    return resp
