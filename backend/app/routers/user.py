from fastapi import APIRouter, HTTPException
from app.schemas import RegisterBody
from app.auth import is_wisc_email
from app.supabase_client import supabase

router = APIRouter(prefix="/user", tags=["user"])


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
        if "already" in msg or "registered" in msg:
            raise HTTPException(status_code=400, detail="Email already registered")
        raise HTTPException(status_code=400, detail=str(e))

    user_obj = getattr(auth_resp, "user", None) or (auth_resp[0] if isinstance(auth_resp, (list, tuple)) else None)
    if not user_obj:
        raise HTTPException(status_code=500, detail="Failed to create user")
    user_id = getattr(user_obj, "id", None) or user_obj.get("id") if isinstance(user_obj, dict) else None
    if not user_id:
        raise HTTPException(status_code=500, detail="Failed to create user")
    try:
        supabase.table("users").insert({
            "id": user_id,
            "name": body.name.strip(),
            "email": body.email.strip().lower(),
            "approximate_location": {"lat": loc.lat, "lng": loc.lng, "label": loc.label},
        }).execute()
    except Exception as e:
        try:
            supabase.auth.admin.delete_user(str(user_id))
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "user_id": user_id,
        "name": body.name.strip(),
        "email": body.email.strip().lower(),
        "created_at": getattr(user_obj, "created_at", None),
    }
