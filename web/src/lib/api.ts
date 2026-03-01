import { createSupabaseBrowser } from "@/lib/supabase/client";

// Use Python backend when NEXT_PUBLIC_API_URL is set (e.g. http://localhost:8001 or http://localhost:8001/api/v1); else same-origin Next.js API
function getBase(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (url) return url.replace(/\/$/, "");
  return "";
}

export function getApiUrl(path: string): string {
  const base = getBase();
  const pathPart = path.startsWith("/") ? path : `/${path}`;
  if (!base) return `/api/v1${pathPart}`;
  // Avoid double /api/v1 if base already includes it
  if (base.endsWith("/api/v1")) return `${base}${pathPart}`;
  return `${base}/api/v1${pathPart}`;
}

/** WebSocket URL for chat. Use ws:// or wss:// based on page protocol when no base; else based on base. */
export function getChatWebSocketUrl(chatId: string, token: string): string {
  const base = getBase();
  const path = `/api/v1/chat/ws?chat_id=${encodeURIComponent(chatId)}&token=${encodeURIComponent(token)}`;
  if (!base) {
    const protocol = typeof window !== "undefined" && window.location?.protocol === "https:" ? "wss:" : "ws:";
    const host = typeof window !== "undefined" ? window.location.host : "localhost:3001";
    return `${protocol}//${host}${path}`;
  }
  const wsProtocol = base.startsWith("https") ? "wss" : "ws";
  // Always parse as URL to get origin only (host:port). Base may be "http://localhost:8001/api/v1" or "localhost:8001/api/v1".
  const normalizedBase = base.includes("://") ? base : `http://${base}`;
  const host = new URL(normalizedBase).host; // "localhost:8001" without path
  return `${wsProtocol}://${host}${path}`;
}

export async function apiFetch(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<Response> {
  const { token, ...rest } = options as RequestInit & { token?: string };
  const headers = new Headers(rest.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(getApiUrl(path), { ...rest, headers });
  } catch (err) {
    // Network error (backend down, CORS, etc.) – return 503 so callers get a Response instead of a throw
    return new Response(JSON.stringify({ detail: "Network error" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  // On 401 (e.g. expired token), refresh session and retry once with new token
  if (response.status === 401 && token && typeof window !== "undefined") {
    const supabase = createSupabaseBrowser();
    const { data, error } = await supabase.auth.refreshSession();
    const newToken = !error && data.session?.access_token ? data.session.access_token : null;
    if (newToken && newToken !== token) {
      headers.set("Authorization", `Bearer ${newToken}`);
      try {
        response = await fetch(getApiUrl(path), { ...rest, headers });
      } catch {
        return new Response(JSON.stringify({ detail: "Network error" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
  }

  return response;
}
