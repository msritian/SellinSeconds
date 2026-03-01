from fastapi import APIRouter, HTTPException
from app.schemas import LoginBody
from app.auth import is_wisc_email
from app.supabase_client import supabase

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login(body: LoginBody):
    if not body.email or not body.password:
        raise HTTPException(status_code=400, detail="email and password required")
    if not is_wisc_email(body.email):
        raise HTTPException(status_code=400, detail="Email must be a valid @wisc.edu address")
    try:
        r = supabase.auth.sign_in_with_password({
            "email": body.email.strip().lower(),
            "password": body.password,
        })
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))
    if not r.user or not r.session:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {
        "user_id": r.user.id,
        "email": r.user.email,
        "access_token": r.session.access_token,
        "expires_at": r.session.expires_at,
    }
