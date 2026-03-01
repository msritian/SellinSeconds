import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Get current user from Authorization: Bearer <token> or from cookie. Returns null if invalid. */
export async function getSessionUser(req: NextRequest): Promise<{ id: string; email: string } | null> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return { id: user.id, email: user.email ?? "" };
}

/** Validate email is @wisc.edu */
export function isWiscEmail(email: string): boolean {
  return typeof email === "string" && email.toLowerCase().endsWith("@wisc.edu");
}
