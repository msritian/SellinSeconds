import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let browserClient: SupabaseClient | null = null;

/**
 * Single Supabase client instance in the browser to avoid multiple GoTrueClient
 * instances, lock contention, and "Lock not released" / React Strict Mode issues.
 */
export function createSupabaseBrowser(): SupabaseClient {
  if (typeof window !== "undefined") {
    if (!browserClient) {
      browserClient = createClient(supabaseUrl, supabaseAnonKey);
    }
    return browserClient;
  }
  return createClient(supabaseUrl, supabaseAnonKey);
}
