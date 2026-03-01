import logging
from fastapi import APIRouter, HTTPException
from app.schemas import RegisterBody
from app.auth import is_wisc_email
from app.supabase_client import supabase

router = APIRouter(prefix="/user", tags=["user"])
log = logging.getLogger(__name__)


@router.post("/register")
def register(body: RegisterBody):
    if not body.name or not body.name.strip():
        raise HTTPException(status_code=400, detail="name is required")
    if not body.email or not body.email.strip():
        raise HTTPException(status_code=400, detail="email is required")
    if not is_wisc_email(body.email):
        raise HTTPException(status_code=400, detail="Email must be a valid @wisc.edu address")
    if not body.password or len(body.password) < 6:
        raise HTTPException(status_code=400, detail="password must be at least 6 characters")
    loc = body.approximate_location
    if loc is None:
        raise HTTPException(status_code=400, detail="approximate_location required")

    try:
        auth_resp = supabase.auth.admin.create_user({
            "email": body.email.strip().lower(),
            "password": body.password,
            "email_confirm": True,
        })
    except Exception as e:
        msg = str(e).lower()
        log.warning("register create_user error: %s", e)
        if "already" in msg or "registered" in msg:
            raise HTTPException(status_code=400, detail="Email already registered")
        raise HTTPException(status_code=400, detail=str(e))

    # Handle UserResponse: can be .user (Pydantic) or dict with "user" or top-level "id"
    user_obj = None
    if hasattr(auth_resp, "user") and auth_resp.user is not None:
        user_obj = auth_resp.user
    elif isinstance(auth_resp, dict):
        user_obj = auth_resp.get("user") or auth_resp
    if not user_obj:
        raise HTTPException(
            status_code=500,
            detail="Failed to create user: unexpected auth response (no user)",
        )
    user_id = getattr(user_obj, "id", None) if not isinstance(user_obj, dict) else user_obj.get("id")
    if not user_id:
        raise HTTPException(
            status_code=500,
            detail="Failed to create user: no user id in response",
        )
    user_id = str(user_id)
    created_at = getattr(user_obj, "created_at", None) if not isinstance(user_obj, dict) else user_obj.get("created_at")

    try:
        supabase.table("users").insert({
            "id": user_id,
            "name": body.name.strip(),
            "email": body.email.strip().lower(),
            "approximate_location": {"lat": loc.lat, "lng": loc.lng, "label": loc.label},
        }).execute()
    except Exception as e:
        try:
            supabase.auth.admin.delete_user(user_id)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Profile creation failed: " + str(e))

    return {
        "user_id": user_id,
        "name": body.name.strip(),
        "email": body.email.strip().lower(),
        "created_at": created_at,
    }
