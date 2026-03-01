import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chat_id: string }> }
) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { chat_id } = await params;
  const supabase = createSupabaseAdmin();
  const { data: chat } = await supabase.from("chats").select("id, product_id").eq("id", chat_id).single();
  if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });

  const { data: participant } = await supabase
    .from("chat_participants")
    .select("user_id, role")
    .eq("chat_id", chat_id)
    .eq("user_id", user.id)
    .single();
  if (!participant) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: product } = await supabase
    .from("products")
    .select("id, item_name, price")
    .eq("id", chat.product_id)
    .single();

  let finalize_state: { buyer_confirmed: boolean; seller_confirmed: boolean; hold_triggered: boolean; status: string } | null = null;
  const { data: fi } = await supabase
    .from("finalize_intents")
    .select("buyer_confirmed, seller_confirmed, hold_triggered")
    .eq("chat_id", chat_id)
    .eq("product_id", chat.product_id)
    .limit(1)
    .maybeSingle();
  if (fi) {
    finalize_state = {
      buyer_confirmed: Boolean(fi.buyer_confirmed),
      seller_confirmed: Boolean(fi.seller_confirmed),
      hold_triggered: Boolean(fi.hold_triggered),
      status: fi.buyer_confirmed && fi.seller_confirmed ? "both_confirmed" : "pending",
    };
  }

  const { data: partsAll } = await supabase
    .from("chat_participants")
    .select("user_id, role")
    .eq("chat_id", chat_id);
  const participantIds = (partsAll ?? []).map((p) => p.user_id);
  let userNames: Record<string, string> = {};
  if (participantIds.length > 0) {
    const { data: users } = await supabase.from("users").select("id, name").in("id", participantIds);
    userNames = Object.fromEntries((users ?? []).map((u) => [u.id, u.name]));
  }
  const participants = (partsAll ?? []).map((p) => ({
    user_id: p.user_id,
    role: p.role,
    name: userNames[p.user_id] ?? "?",
  }));

  return NextResponse.json({
    chat_id: chat.id,
    product_id: chat.product_id,
    my_role: participant.role,
    product: product ? { product_id: product.id, item_name: product.item_name, price: Number(product.price) } : null,
    finalize_state,
    participants,
  });
}
