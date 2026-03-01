import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { isWiscEmail } from "@/lib/auth";
import type { LocationInput } from "@/lib/types";

interface RegisterBody {
  name: string;
  email: string;
  password: string;
  approximate_location: { lat: number; lng: number; label: string };
}

export async function POST(req: NextRequest) {
  try {
    const body: RegisterBody = await req.json();
    const { name, email, password, approximate_location } = body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }
    if (!isWiscEmail(email)) {
      return NextResponse.json(
        { error: "Email must be a valid @wisc.edu address" },
        { status: 400 }
      );
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { error: "password must be at least 6 characters" },
        { status: 400 }
      );
    }
    const loc = approximate_location as LocationInput | undefined;
    if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number" || !loc.label) {
      return NextResponse.json(
        { error: "approximate_location must include lat, lng, and label" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdmin();
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
    });

    if (authError) {
      if (authError.message.includes("already registered"))
        return NextResponse.json({ error: "Email already registered" }, { status: 400 });
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    if (!authData.user) {
      return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
    }

    const { error: profileError } = await supabase.from("users").insert({
      id: authData.user.id,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      approximate_location: {
        lat: loc.lat,
        lng: loc.lng,
        label: String(loc.label),
      },
    });

    if (profileError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    return NextResponse.json({
      user_id: authData.user.id,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      created_at: authData.user.created_at,
    });
  } catch (e) {
    console.error("register error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
