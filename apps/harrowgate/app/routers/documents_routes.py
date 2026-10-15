from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse, FileResponse
from fastapi.templating import Jinja2Templates

from ..db import get_conn
from .. import auth

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

UPLOADS_DIR = Path(__file__).resolve().parent.parent.parent / "uploads" / "leases"


@router.get("/documents", response_class=HTMLResponse)
def list_documents(request: Request):
    session = auth.current_session(request)
    if not session:
        return RedirectResponse(url="/login", status_code=303)

    conn = get_conn()
    docs = conn.execute(
        "SELECT * FROM documents WHERE tenant_id = ? ORDER BY uploaded_at DESC", (session["sub"],)
    ).fetchall()
    conn.close()
    return templates.TemplateResponse(request, "documents_list.html", {"docs": docs, "session": session})


@router.get("/documents/{doc_id}/download")
def download_document(request: Request, doc_id: int):
    session = auth.current_session(request)
    if not session:
        return RedirectResponse(url="/login", status_code=303)

    # Lease PDFs are keyed by their row id in the link we email tenants,
    # so the lookup just needs the id -- the tenant_id on the row is for
    # display purposes on the documents list above.
    conn = get_conn()
    doc = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    conn.close()

    if not doc:
        return HTMLResponse("Not found", status_code=404)

    file_path = UPLOADS_DIR / doc["file_path"]
    if not file_path.exists():
        return HTMLResponse("File missing", status_code=404)

    return FileResponse(file_path, filename=doc["title"])
