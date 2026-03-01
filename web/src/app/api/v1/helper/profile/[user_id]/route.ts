import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ user_id: string }> }
) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { user_id } = await params;
  if (user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("helper_profiles")
    .select("*")
    .eq("user_id", user_id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json({
    helper_id: data.id,
    user_id: data.user_id,
    location: data.location,
    vehicle_type: data.vehicle_type,
    lift_capacity_kg: Number(data.lift_capacity_kg),
    default_quoted_fee: Number(data.default_quoted_fee),
    assistance_notes: data.assistance_notes,
    created_at: data.created_at,
    updated_at: data.updated_at,
  });
}
