from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

from ..db import get_conn

router = APIRouter()

# --- Benign public surface --------------------------------------------
# Ordinary endpoints the resident site and the marketing pages use. None
# of these expose anything sensitive; they are the bulk of what a crawler
# or content-discovery scan turns up.

@router.get("/api/health")
def api_health():
    return {"status": "ok"}


@router.get("/api/announcements")
def announcements():
    return [
        {"id": 1, "title": "Planned water shutoff — Harrowgate Lane, Jan 18", "posted": "2024-01-09"},
        {"id": 2, "title": "New online rent payment options", "posted": "2024-01-15"},
        {"id": 3, "title": "Snow clearing schedule for car parks", "posted": "2024-01-20"},
    ]


@router.get("/api/offices")
def offices():
    return [
        {"name": "Bristol lettings office", "phone": "0117-555-0160", "hours": "Mon–Fri 9–17"},
        {"name": "Out-of-hours maintenance line", "phone": "0800-555-0199", "hours": "24/7"},
    ]


@router.get("/api/amenities")
def amenities():
    return ["On-site parking", "Bike storage", "Communal garden", "Laundry room", "EV charging (selected sites)"]


@router.get("/api/faq")
def faq():
    return [
        {"q": "How do I report a repair?", "a": "Raise a maintenance request from your dashboard."},
        {"q": "When is rent due?", "a": "On the 1st of each month."},
        {"q": "How do I get my deposit back?", "a": "Deposits are returned within 10 working days of move-out."},
    ]


@router.get("/robots.txt", response_class=PlainTextResponse)
def robots():
    return (
        "User-agent: *\n"
        "Disallow: /admin\n"
        "Disallow: /api/account\n"
        "Disallow: /static/internal\n"
        "Allow: /\n"
        "Sitemap: /sitemap.xml\n"
    )


@router.get("/sitemap.xml", response_class=PlainTextResponse)
def sitemap():
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        "  <url><loc>/</loc></url>\n"
        "  <url><loc>/login</loc></url>\n"
        "  <url><loc>/dashboard</loc></url>\n"
        "  <url><loc>/maintenance</loc></url>\n"
        "  <url><loc>/documents</loc></url>\n"
        "</urlset>\n"
    )
