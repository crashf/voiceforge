"""Authentication utilities — JWT + password hashing."""

import hashlib
import hmac
import os
import time
import json
import base64
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models.user import User

# Simple JWT-like token using HMAC-SHA256 (no external deps needed)
SECRET_KEY = os.environ.get("VF_SECRET_KEY", "voiceforge-change-me-in-production")
TOKEN_EXPIRY = 86400 * 7  # 7 days


def hash_password(password: str) -> str:
    """Hash a password with a random salt using SHA-256."""
    salt = os.urandom(16).hex()
    hashed = hashlib.sha256(f"{salt}:{password}".encode()).hexdigest()
    return f"{salt}:{hashed}"


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against a stored hash."""
    salt, stored_hash = password_hash.split(":", 1)
    computed = hashlib.sha256(f"{salt}:{password}".encode()).hexdigest()
    return hmac.compare_digest(computed, stored_hash)


def create_token(user_id: str, username: str) -> str:
    """Create a signed token."""
    payload = {
        "sub": user_id,
        "username": username,
        "exp": int(time.time()) + TOKEN_EXPIRY,
        "iat": int(time.time()),
    }
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    signature = hmac.new(SECRET_KEY.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{signature}"


def decode_token(token: str) -> dict | None:
    """Decode and verify a token. Returns payload or None."""
    try:
        payload_b64, signature = token.rsplit(".", 1)
        expected_sig = hmac.new(SECRET_KEY.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected_sig):
            return None
        # Re-pad base64
        padded = payload_b64 + "=" * (4 - len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    """Extract and validate user from Authorization header or ?token= query param."""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
    else:
        # Fallback to query param (for audio/download URLs loaded by browser directly)
        token = request.query_params.get("token", "")
    if not token:
        raise HTTPException(401, "Not authenticated")
    payload = decode_token(token)
    if not payload:
        raise HTTPException(401, "Invalid or expired token")

    user = await db.get(User, payload["sub"])
    if not user or not user.is_active:
        raise HTTPException(401, "User not found or inactive")

    return user
