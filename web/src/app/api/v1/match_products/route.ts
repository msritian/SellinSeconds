import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { calculateDistancesKm } from "@/lib/google-maps";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const item_name = searchParams.get("item_name") ?? undefined;
  const max_price = searchParams.get("max_price");
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  const radius_km = parseFloat(searchParams.get("radius_km") ?? "5");
  const status = searchParams.get("status") ?? "available";

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  let query = supabase
    .from("products")
    .select("id, item_name, price, location, media_urls, status")
    .eq("status", status);

  if (item_name?.trim()) {
    query = query.ilike("item_name", `%${item_name.trim()}%`);
  }
  if (max_price && !Number.isNaN(parseFloat(max_price))) {
    query = query.lte("price", parseFloat(max_price));
  }

  const { data: products, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = products ?? [];
  if (list.length === 0) {
    return NextResponse.json({ products: [], total: 0 });
  }

  const origin = { lat, lng };
  const destinations = list.map((p) => (p.location as { lat: number; lng: number }) ?? { lat: 0, lng: 0 });
  const distances = await calculateDistancesKm(origin, destinations);

  const withDistance = list
    .map((p, i) => ({
      product_id: p.id,
      item_name: p.item_name,
      price: Number(p.price),
      location: p.location,
      media_urls: Array.isArray(p.media_urls) ? p.media_urls : [],
      status: p.status,
      distance_km: distances[i] ?? null,
    }))
    .filter((p) => p.distance_km !== null && p.distance_km <= radius_km)
    .sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0));

  return NextResponse.json({
    products: withDistance,
    total: withDistance.length,
  });
}
