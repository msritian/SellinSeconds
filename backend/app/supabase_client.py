from typing import Generator

from fastapi import HTTPException
from supabase import create_client, Client
from app.config import settings

# Force HTTP/1.1 for PostgREST to avoid httpx.ReadError [Errno 35] under concurrent requests
# (shared HTTP/2 connection pool in sync client causes "Resource temporarily unavailable")
def _postgrest_create_session_http1(self, base_url, headers, timeout, verify=True, proxy=None):
    from postgrest.utils import SyncClient
    return SyncClient(
        base_url=base_url,
        headers=headers,
        timeout=timeout,
        verify=verify,
        proxy=proxy,
        follow_redirects=True,
        http2=False,
    )

try:
    from postgrest._sync.client import SyncPostgrestClient
    SyncPostgrestClient.create_session = _postgrest_create_session_http1
except Exception:
    pass

class _UnconfiguredSupabase:
    """Proxy that raises 503 so container can start without Supabase env (e.g. Cloud Run)."""

    def __getattr__(self, _name: str) -> None:
        raise HTTPException(
            status_code=503,
            detail="Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Cloud Run.",
        )


# Only create client when configured (so container can start on Cloud Run before env is set)
if settings.supabase_url and settings.supabase_service_role_key:
    supabase: Client = create_client(
        settings.supabase_url,
        settings.supabase_service_role_key,
    )
else:
    supabase = _UnconfiguredSupabase()  # type: ignore[assignment]


def get_supabase() -> Generator[Client, None, None]:
    """Per-request Supabase client to avoid connection pool contention (chat 500s).
    Creates a new client per request and closes it after; do not close the global client."""
    if isinstance(supabase, _UnconfiguredSupabase):
        raise HTTPException(status_code=503, detail="Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Cloud Run.")
    client = create_client(
        settings.supabase_url,
        settings.supabase_service_role_key,
    )
    try:
        yield client
    finally:
        if getattr(client, "postgrest", None) is not None:
            client.postgrest.aclose()
