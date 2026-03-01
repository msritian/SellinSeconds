import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { isWiscEmail } from "@/lib/auth";

interface LoginBody {
  email: string;
  password: string;
}

/** Client should call Supabase auth.signInWithPassword() and get the session; this endpoint is optional for custom logic. */
export async function POST(req: NextRequest) {
  try {
    const body: LoginBody = await req.json();
    const { email, password } = body;
    if (!email || !password) {
      return NextResponse.json({ error: "email and password required" }, { status: 400 });
    }
    if (!isWiscEmail(email)) {
      return NextResponse.json({ error: "Email must be a valid @wisc.edu address" }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({
      user_id: data.user.id,
      email: data.user.email,
      access_token: data.session?.access_token,
      expires_at: data.session?.expires_at,
    });
  } catch (e) {
    console.error("login error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
