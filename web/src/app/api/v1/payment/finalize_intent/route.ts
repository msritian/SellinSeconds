import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";

interface Body {
  chat_id: string;
  product_id: string;
  confirmed_by: string;
  role: "buyer" | "seller";
  amount: number;
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body: Body = await req.json();
    const { chat_id, product_id, confirmed_by, role, amount } = body;

    if (confirmed_by !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!chat_id || !product_id || !role || typeof amount !== "number") {
      return NextResponse.json({ error: "chat_id, product_id, role, amount required" }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();
    let row = await supabase
      .from("finalize_intents")
      .select("*")
      .eq("chat_id", chat_id)
      .eq("product_id", product_id)
      .single()
      .then((r) => r.data);

    if (row) {
      const updates: { buyer_confirmed?: boolean; seller_confirmed?: boolean; hold_triggered?: boolean } = {};
      if (role === "buyer") updates.buyer_confirmed = true;
      if (role === "seller") updates.seller_confirmed = true;
      if (row.buyer_confirmed && row.seller_confirmed) {
        updates.hold_triggered = true;
        await supabase.from("payment_holds").insert({
          buyer_id: row.buyer_id,
          product_id,
          chat_id,
          amount: row.amount,
          status: "held",
        });
      }
      const { data: updated } = await supabase
        .from("finalize_intents")
        .update(updates)
        .eq("id", row.id)
        .select()
        .single();
      row = updated ?? row;
    } else {
      const { data: chat } = await supabase.from("chats").select("id").eq("id", chat_id).single();
      if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
      const { data: participants } = await supabase
        .from("chat_participants")
        .select("user_id, role")
        .eq("chat_id", chat_id);
      const buyer = participants?.find((p) => p.role === "buyer")?.user_id;
      const seller = participants?.find((p) => p.role === "seller")?.user_id;
      if (!buyer || !seller) return NextResponse.json({ error: "Invalid chat" }, { status: 400 });

      const buyerConfirmed = role === "buyer";
      const sellerConfirmed = role === "seller";
      const holdTriggered = buyerConfirmed && sellerConfirmed;
      const { data: inserted, error } = await supabase
        .from("finalize_intents")
        .insert({
          chat_id,
          product_id,
          buyer_id: buyer,
          seller_id: seller,
          buyer_confirmed: buyerConfirmed,
          seller_confirmed: sellerConfirmed,
          amount,
          hold_triggered: holdTriggered,
        })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      row = inserted;
      if (holdTriggered) {
        await supabase.from("payment_holds").insert({
          buyer_id: buyer,
          product_id,
          chat_id,
          amount,
          status: "held",
        });
      }
    }

    return NextResponse.json({
      finalize_intent_id: row.id,
      buyer_confirmed: row.buyer_confirmed,
      seller_confirmed: row.seller_confirmed,
      status: row.buyer_confirmed && row.seller_confirmed ? "both_confirmed" : "pending",
      hold_triggered: row.hold_triggered,
    });
  } catch (e) {
    console.error("finalize_intent error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
