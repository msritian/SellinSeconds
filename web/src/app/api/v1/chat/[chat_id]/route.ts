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

  return NextResponse.json({
    chat_id: chat.id,
    product_id: chat.product_id,
    my_role: participant.role,
    product: product ? { product_id: product.id, item_name: product.item_name, price: Number(product.price) } : null,
  });
}
