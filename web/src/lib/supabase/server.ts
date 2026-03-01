import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

/** Server-side Supabase client with service role for API routes (bypasses RLS). Auth is enforced in route handlers via getSessionUser. */
export function createSupabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY required");
  return createClient(supabaseUrl, key, {
    auth: { persistSession: false },
  });
}
