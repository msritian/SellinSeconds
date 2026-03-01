import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { calculateDistancesKm } from "@/lib/google-maps";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ product_id: string }> }
) {
  const { product_id } = await params;
  if (!product_id) return NextResponse.json({ error: "product_id required" }, { status: 400 });

  const supabase = createSupabaseAdmin();
  const { data: product, error } = await supabase
    .from("products")
    .select("id, seller_id, item_name, description, price, status, location, media_urls, created_at")
    .eq("id", product_id)
    .single();

  if (error || !product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const { data: seller } = await supabase
    .from("users")
    .select("id, name")
    .eq("id", product.seller_id)
    .single();

  const { data: phRows } = await supabase
    .from("product_helpers")
    .select("helper_id, quoted_fee")
    .eq("product_id", product_id);

  const helpers: Array<{
    helper_id: string;
    name: string;
    vehicle_type: string;
    lift_capacity_kg: number;
    proximity_km: number;
    assistance_level: string;
    quoted_fee: number;
  }> = [];

  if (phRows?.length) {
    const helperIds = phRows.map((r) => r.helper_id);
    const { data: profiles } = await supabase
      .from("helper_profiles")
      .select("id, user_id, vehicle_type, lift_capacity_kg, location")
      .in("id", helperIds);
    const userIds = profiles?.map((p) => p.user_id) ?? [];
    const { data: users } = await supabase.from("users").select("id, name").in("id", userIds);
    const userMap = new Map((users ?? []).map((u) => [u.id, u.name]));
    const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);

    const origins = (profiles ?? []).map((p) => p.location).filter((l) => l?.lat != null);
    const dest = product.location as { lat: number; lng: number };
    let distances: (number | null)[] = [];
    if (origins.length && dest?.lat != null) {
      distances = await calculateDistancesKm(dest, origins);
    }

    let i = 0;
    for (const ph of phRows) {
      const profile = profileMap.get(ph.helper_id);
      if (!profile) continue;
      const dist = distances[i] ?? null;
      i++;
      helpers.push({
        helper_id: profile.id,
        name: userMap.get(profile.user_id) ?? "Helper",
        vehicle_type: profile.vehicle_type,
        lift_capacity_kg: Number(profile.lift_capacity_kg),
        proximity_km: dist ?? 0,
        assistance_level: profile.lift_capacity_kg > 20 ? "high" : "medium",
        quoted_fee: Number(ph.quoted_fee),
      });
    }
  }

  return NextResponse.json({
    product_id: product.id,
    seller: { user_id: product.seller_id, name: seller?.name ?? "" },
    item_name: product.item_name,
    description: product.description,
    price: Number(product.price),
    status: product.status,
    location: product.location,
    media_urls: product.media_urls ?? [],
    helpers,
    helper_count: helpers.length,
    created_at: product.created_at,
  });
}
