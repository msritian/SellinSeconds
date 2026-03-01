import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";

interface Body {
  hold_id: string;
  confirmed_by: string;
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: Body = await req.json();
  const { hold_id, confirmed_by } = body;

  if (confirmed_by !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!hold_id) return NextResponse.json({ error: "hold_id required" }, { status: 400 });

  const supabase = createSupabaseAdmin();
  const { data: hold, error: holdErr } = await supabase
    .from("payment_holds")
    .select("id, buyer_id, product_id, chat_id, amount, status")
    .eq("id", hold_id)
    .single();
  if (holdErr || !hold) return NextResponse.json({ error: "Hold not found" }, { status: 404 });
  if (hold.buyer_id !== user.id) return NextResponse.json({ error: "Only buyer can release" }, { status: 403 });
  if (hold.status !== "held") return NextResponse.json({ error: "Hold already released" }, { status: 400 });

  const { data: product } = await supabase.from("products").select("seller_id").eq("id", hold.product_id).single();
  const seller_id = product?.seller_id;
  const { data: ph } = await supabase
    .from("product_helpers")
    .select("helper_id, quoted_fee")
    .eq("product_id", hold.product_id)
    .limit(1)
    .single();
  const { data: helperProfile } = ph
    ? await supabase.from("helper_profiles").select("user_id").eq("id", ph.helper_id).single()
    : { data: null };
  const helper_id = helperProfile?.user_id;
  const helper_amount = ph ? Number(ph.quoted_fee) : 0;
  const seller_amount = Number(hold.amount) - helper_amount;

  await supabase.from("payment_holds").update({ status: "released" }).eq("id", hold_id);

  return NextResponse.json({
    status: "released",
    distributed_to: {
      seller_id: seller_id ?? null,
      seller_amount,
      helper_id: helper_id ?? null,
      helper_amount,
    },
  });
}
