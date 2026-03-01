import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";

interface Body {
  buyer_id: string;
  product_id: string;
  chat_id: string;
  amount: number;
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: Body = await req.json();
  const { buyer_id, product_id, chat_id, amount } = body;

  if (!buyer_id || !product_id || !chat_id || typeof amount !== "number") {
    return NextResponse.json({ error: "buyer_id, product_id, chat_id, amount required" }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { data: participant } = await supabase
    .from("chat_participants")
    .select("user_id")
    .eq("chat_id", chat_id)
    .eq("user_id", user.id)
    .single();
  if (!participant) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: hold, error } = await supabase
    .from("payment_holds")
    .insert({ buyer_id, product_id, chat_id, amount, status: "held" })
    .select("id, status, amount")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    hold_id: hold.id,
    status: hold.status,
    amount: Number(hold.amount),
  });
}
