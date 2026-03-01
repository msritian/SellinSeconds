import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { calculateDistancesKm } from "@/lib/google-maps";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const helper_id = searchParams.get("helper_id");
  const radius_km = parseFloat(searchParams.get("radius_km") ?? "5");

  const supabase = createSupabaseAdmin();
  const { data: profile, error: profileErr } = await supabase
    .from("helper_profiles")
    .select("id, user_id, location")
    .eq("user_id", user.id)
    .single();

  if (profileErr || !profile) {
    return NextResponse.json({ error: "Helper profile not found" }, { status: 404 });
  }
  if (helper_id && helper_id !== profile.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: products } = await supabase
    .from("products")
    .select("id, item_name, price, location, seller_id")
    .eq("status", "available");

  const list = products ?? [];
  if (list.length === 0) {
    return NextResponse.json({ leads: [] });
  }

  const origin = profile.location as { lat: number; lng: number };
  const destinations = list.map((p) => (p.location as { lat: number; lng: number }) ?? { lat: 0, lng: 0 });
  const distances = await calculateDistancesKm(origin, destinations);

  const sellerIds = [...new Set(list.map((p) => p.seller_id))];
  const { data: sellers } = await supabase.from("users").select("id, name").in("id", sellerIds);
  const sellerMap = new Map((sellers ?? []).map((s) => [s.id, s]));

  const leads = list
    .map((p, i) => ({
      product_id: p.id,
      item_name: p.item_name,
      pickup_location: p.location,
      distance_km: distances[i] ?? null,
      price: Number(p.price),
      seller: sellerMap.get(p.seller_id) ?? { user_id: p.seller_id, name: "" },
    }))
    .filter((l) => l.distance_km !== null && l.distance_km <= radius_km)
    .sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0));

  return NextResponse.json({ leads });
}
