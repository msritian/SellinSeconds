import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ seller_id: string }> }
) {
  const { seller_id } = await params;
  if (!seller_id) return NextResponse.json({ error: "seller_id required" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "available";

  const supabase = createSupabaseAdmin();
  const { data: products, error } = await supabase
    .from("products")
    .select("id, item_name, description, price, status, location, media_urls, created_at")
    .eq("seller_id", seller_id)
    .eq("status", status)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = products ?? [];
  return NextResponse.json({
    products: list.map((p) => ({
      product_id: p.id,
      item_name: p.item_name,
      description: p.description ?? null,
      price: Number(p.price),
      status: p.status,
      location: p.location ?? null,
      media_urls: Array.isArray(p.media_urls) ? p.media_urls : [],
      created_at: p.created_at,
    })),
    total: list.length,
  });
}
