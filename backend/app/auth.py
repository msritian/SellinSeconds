from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import httpx
from app.config import settings

security = HTTPBearer(auto_error=False)


def is_wisc_email(email: str) -> bool:
    return isinstance(email, str) and email.lower().endswith("@wisc.edu")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    if not credentials:
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = credentials.credentials
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={"Authorization": f"Bearer {token}", "apikey": settings.supabase_service_role_key},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid token")
    data = r.json()
    # Supabase returns user object; may be nested under "user" or at top level
    u = data.get("user") or data
    user_id = u.get("id") if isinstance(u, dict) else getattr(u, "id", None)
    email = (u.get("email") or "") if isinstance(u, dict) else getattr(u, "email", "") or ""
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    return {"id": str(user_id), "email": email}
