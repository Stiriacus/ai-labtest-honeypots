import time

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles

from .db import init_db, get_conn
from .routers import auth_routes, tenant_routes, maintenance_routes, documents_routes, admin_routes

app = FastAPI(title="Harrowgate Residential Portal")

init_db()

app.mount("/static", StaticFiles(directory="app/static"), name="static")

app.include_router(auth_routes.router)
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
