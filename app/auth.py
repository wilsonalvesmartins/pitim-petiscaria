import os
import hmac
import hashlib
import time
import base64
import json
from typing import Optional
from fastapi import Request, HTTPException, status, Depends
from fastapi.responses import RedirectResponse

ADMIN_USER = os.getenv("ADMIN_USER", "admin")
ADMIN_PASS = os.getenv("ADMIN_PASS", "admin123")
SECRET_KEY = os.getenv("SECRET_KEY", "pitim-petiscaria-secret-key-2026-cajuru")

def verify_credentials(username: str, password: str) -> bool:
    return hmac.compare_digest(username, ADMIN_USER) and hmac.compare_digest(password, ADMIN_PASS)

def create_admin_token() -> str:
    payload = {
        "user": ADMIN_USER,
        "exp": int(time.time()) + 86400 * 7 # 7 days validity
    }
    raw = json.dumps(payload).encode("utf-8")
    b64_payload = base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")
    sig = hmac.new(SECRET_KEY.encode("utf-8"), b64_payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{b64_payload}.{sig}"

def verify_admin_token(token: Optional[str]) -> bool:
    if not token or "." not in token:
        return False
    parts = token.split(".")
    if len(parts) != 2:
        return False
    b64_payload, sig = parts
    expected_sig = hmac.new(SECRET_KEY.encode("utf-8"), b64_payload.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected_sig):
        return False
    try:
        padded = b64_payload + "=" * ((4 - len(b64_payload) % 4) % 4)
        raw = base64.urlsafe_b64decode(padded)
        data = json.loads(raw.decode("utf-8"))
        if data.get("exp", 0) < time.time():
            return False
        return data.get("user") == ADMIN_USER
    except Exception:
        return False

def get_current_admin(request: Request) -> bool:
    token = request.cookies.get("pitim_admin_token")
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            
    if not verify_admin_token(token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autorizado")
    return True

def is_admin_logged_in(request: Request) -> bool:
    token = request.cookies.get("pitim_admin_token")
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
    return verify_admin_token(token)
