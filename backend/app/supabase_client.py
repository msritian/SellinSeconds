from typing import Generator

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

supabase = create_client(
    settings.supabase_url,
    settings.supabase_service_role_key,
)


def get_supabase() -> Generator[Client, None, None]:
    """Per-request Supabase client to avoid connection pool contention (chat 500s)."""
    client = create_client(
        settings.supabase_url,
        settings.supabase_service_role_key,
    )
    try:
        yield client
    finally:
        if getattr(client, "_postgrest", None) is not None:
            client.postgrest.aclose()
