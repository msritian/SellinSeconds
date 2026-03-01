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

export async function apiFetch(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<Response> {
  const { token, ...rest } = options as RequestInit & { token?: string };
  const headers = new Headers(rest.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response = await fetch(getApiUrl(path), { ...rest, headers });

  // On 401 (e.g. expired token), refresh session and retry once with new token
  if (response.status === 401 && token && typeof window !== "undefined") {
    const supabase = createSupabaseBrowser();
    const { data, error } = await supabase.auth.refreshSession();
    const newToken = !error && data.session?.access_token ? data.session.access_token : null;
    if (newToken && newToken !== token) {
      headers.set("Authorization", `Bearer ${newToken}`);
      response = await fetch(getApiUrl(path), { ...rest, headers });
    }
  }

  return response;
}
