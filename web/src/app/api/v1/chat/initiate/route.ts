import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";

interface Body {
  product_id: string;
  buyer_id: string;
  seller_id: string;
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body: Body = await req.json();
    const { product_id, buyer_id, seller_id } = body;

    if (!product_id || !buyer_id || !seller_id) {
      return NextResponse.json({ error: "product_id, buyer_id, seller_id required" }, { status: 400 });
    }
    if (user.id !== buyer_id && user.id !== seller_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = createSupabaseAdmin();

    const addPendingHelpersToChat = async (chatId: string) => {
      const { data: pending } = await supabase
        .from("product_accepted_helpers")
        .select("helper_id")
        .eq("product_id", product_id)
        .eq("buyer_id", buyer_id);
      for (const row of pending ?? []) {
        const { data: hp } = await supabase
          .from("helper_profiles")
          .select("user_id")
          .eq("id", row.helper_id)
          .single();
        if (hp?.user_id) {
          await supabase.from("chat_participants").upsert(
            { chat_id: chatId, user_id: hp.user_id, role: "helper" },
            { onConflict: "chat_id,user_id" }
          );
        }
      }
      await supabase.from("product_accepted_helpers").delete().eq("product_id", product_id).eq("buyer_id", buyer_id);
    };

    // Idempotent: return existing chat if buyer+seller already have one for this product
    const { data: existingChats } = await supabase
      .from("chats")
      .select("id")
      .eq("product_id", product_id);
    for (const c of existingChats ?? []) {
      const { data: participants } = await supabase
        .from("chat_participants")
        .select("user_id")
        .eq("chat_id", c.id);
      const userIds = new Set((participants ?? []).map((p) => p.user_id));
      if (userIds.has(buyer_id) && userIds.has(seller_id)) {
        await addPendingHelpersToChat(c.id);
        const { data: parts } = await supabase.from("chat_participants").select("user_id").eq("chat_id", c.id);
        return NextResponse.json({
          chat_id: c.id,
          participants: parts?.map((p) => p.user_id) ?? [buyer_id, seller_id],
        });
      }
    }

    const { data: chat, error } = await supabase
      .from("chats")
      .insert({ product_id })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from("chat_participants").insert([
      { chat_id: chat.id, user_id: buyer_id, role: "buyer" },
      { chat_id: chat.id, user_id: seller_id, role: "seller" },
    ]);
    await addPendingHelpersToChat(chat.id);

    const { data: participants } = await supabase
      .from("chat_participants")
      .select("user_id")
      .eq("chat_id", chat.id);
    return NextResponse.json(
      {
        chat_id: chat.id,
        participants: participants?.map((p) => p.user_id) ?? [buyer_id, seller_id],
      },
      { status: 201 }
    );
  } catch (e) {
    console.error("chat initiate error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
