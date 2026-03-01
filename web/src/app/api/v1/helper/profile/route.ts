import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import type { LocationInput } from "@/lib/types";

interface ProfileBody {
  user_id: string;
  location: LocationInput;
  vehicle_type: string;
  lift_capacity_kg: number;
  default_quoted_fee?: number;
  assistance_notes?: string;
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body: ProfileBody = await req.json();
    const { user_id, location, vehicle_type, lift_capacity_kg, default_quoted_fee, assistance_notes } = body;

    if (user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!location || typeof location.lat !== "number" || typeof location.lng !== "number" || !location.label) {
      return NextResponse.json({ error: "location with lat, lng, label required" }, { status: 400 });
    }
    if (!vehicle_type || typeof lift_capacity_kg !== "number") {
      return NextResponse.json({ error: "vehicle_type and lift_capacity_kg required" }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();
    const { data: existing } = await supabase
      .from("helper_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    const profileRow = {
      user_id: user.id,
      location: { lat: location.lat, lng: location.lng, label: location.label },
      vehicle_type: String(vehicle_type),
      lift_capacity_kg: Number(lift_capacity_kg),
      default_quoted_fee: Number(default_quoted_fee ?? 0),
      assistance_notes: assistance_notes ? String(assistance_notes) : null,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { data: updated, error } = await supabase
        .from("helper_profiles")
        .update(profileRow)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({
        helper_id: updated.id,
        is_new: false,
        profile: profileRow,
      });
    }

    const { data: inserted, error } = await supabase
      .from("helper_profiles")
      .insert(profileRow)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      helper_id: inserted.id,
      is_new: true,
      profile: profileRow,
    });
  } catch (e) {
    console.error("helper profile error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
