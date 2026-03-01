import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ product_id: string }> }
) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { product_id } = await params;
  const body = await req.json().catch(() => ({}));
  const status = body.status;

  if (status !== "sold") {
    return NextResponse.json({ error: "status must be 'sold'" }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { data: product } = await supabase
    .from("products")
    .select("seller_id")
    .eq("id", product_id)
    .single();

  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  if (product.seller_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: updated, error } = await supabase
    .from("products")
    .update({ status: "sold" })
    .eq("id", product_id)
    .select("id, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product_id: updated.id, status: updated.status });
}
