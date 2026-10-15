import hashlib
import os
import time

import jwt
from fastapi import Request

JWT_SECRET = os.environ.get("JWT_SECRET", "harrowgate-dev-secret")
JWT_ALG = "HS256"
SESSION_COOKIE = "hg_session"


def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    salt = salt or os.urandom(16).hex()
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000)
    return digest.hex(), salt


def verify_password(password: str, salt: str, expected_hash: str) -> bool:
    digest, _ = hash_password(password, salt)
    return digest == expected_hash


def issue_session(tenant_row) -> str:
    payload = {
        "sub": str(tenant_row["id"]),
        "email": tenant_row["email"],
        "role": tenant_row["role"],
        "iat": int(time.time()),
        "exp": int(time.time()) + 60 * 60 * 12,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def current_session(request: Request):
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        return None
    payload["sub"] = int(payload["sub"])
    return payload
