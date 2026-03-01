import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";

/**
 * GET /api/v1/chat – List all chats for the current user.
 * Returns same shape as Python backend: product, other_party, last_message, unread_count.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createSupabaseAdmin();

  const { data: parts, error: partsErr } = await supabase
    .from("chat_participants")
    .select("chat_id, role, last_read_at")
    .eq("user_id", user.id);
  if (partsErr) return NextResponse.json({ error: partsErr.message }, { status: 500 });
  if (!parts?.length) return NextResponse.json({ chats: [] });

  const chatIds = parts.map((p) => p.chat_id);
  const partByChat = Object.fromEntries(parts.map((p) => [p.chat_id, p]));

  const { data: chats, error: chatsErr } = await supabase
    .from("chats")
    .select("id, product_id")
    .in("id", chatIds);
  if (chatsErr) return NextResponse.json({ error: chatsErr.message }, { status: 500 });
  if (!chats?.length) return NextResponse.json({ chats: [] });

  const productIds = [...new Set(chats.map((c) => c.product_id))];
  const { data: products } = await supabase
    .from("products")
    .select("id, item_name, price, status")
    .in("id", productIds);
  const productMap = Object.fromEntries((products ?? []).map((p) => [p.id, p]));

  // Single query: all messages in these chats (for last message + unread)
  const { data: allMessages, error: msgErr } = await supabase
    .from("messages")
    .select("id, chat_id, sender_id, content, sent_at")
    .in("chat_id", chatIds)
    .order("sent_at", { ascending: false });
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });
  const messagesByChat = (allMessages ?? []).reduce(
    (acc, m) => {
      if (!acc[m.chat_id]) acc[m.chat_id] = [];
      acc[m.chat_id].push(m);
      return acc;
    },
    {} as Record<string, Array<{ chat_id: string; sender_id: string; content: string | null; sent_at: string }>>
  );

  // Batch: all other participants (not me) for these chats
  const { data: allOtherParts } = await supabase
    .from("chat_participants")
    .select("chat_id, user_id, role")
    .in("chat_id", chatIds)
    .neq("user_id", user.id);
  const otherByChat = (allOtherParts ?? []).reduce(
    (acc, p) => {
      if (!acc[p.chat_id]) acc[p.chat_id] = [];
      acc[p.chat_id].push(p);
      return acc;
    },
    {} as Record<string, { user_id: string; role: string }[]>
  );
  const allOtherUserIds = [...new Set((allOtherParts ?? []).map((p) => p.user_id))];
  const { data: otherUsers } = await supabase
    .from("users")
    .select("id, name")
    .in("id", allOtherUserIds);
  const userNames = Object.fromEntries((otherUsers ?? []).map((u) => [u.id, u.name]));

  const result: Array<{
    chat_id: string;
    product: { product_id: string; item_name: string; price: number; status: string };
    my_role: string;
    other_party: Array<{ user_id: string; name: string; role: string }>;
    last_message: { sender_id: string; content: string; sent_at: string } | null;
    unread_count: number;
  }> = [];

  for (const ch of chats) {
    const chatId = ch.id;
    const myPart = partByChat[chatId];
    if (!myPart) continue;
    const product = productMap[ch.product_id];
    const lastRead = myPart.last_read_at ?? null;
    const chatMessages = messagesByChat[chatId] ?? [];
    const lastMessageRow = chatMessages[0] ?? null;
    const lastMessage = lastMessageRow
      ? {
          sender_id: lastMessageRow.sender_id,
          content: (lastMessageRow.content ?? "").slice(0, 100),
          sent_at: lastMessageRow.sent_at,
        }
      : null;
    const fromOthers = chatMessages.filter((m) => m.sender_id !== user.id);
    const unread_count =
      lastRead == null
        ? fromOthers.length
        : fromOthers.filter((m) => new Date(m.sent_at) > new Date(lastRead)).length;

    const others = otherByChat[chatId] ?? [];
    const other_party = others.map((p) => ({
      user_id: p.user_id,
      name: userNames[p.user_id] ?? "?",
      role: p.role,
    }));

    result.push({
      chat_id: chatId,
      product: {
        product_id: ch.product_id,
        item_name: product?.item_name ?? "?",
        price: Number(product?.price ?? 0),
        status: product?.status ?? "available",
      },
      my_role: myPart.role,
      other_party,
      last_message: lastMessage,
      unread_count,
    });
  }

  result.sort((a, b) => {
    const ta = a.last_message?.sent_at ?? "";
    const tb = b.last_message?.sent_at ?? "";
    return tb.localeCompare(ta);
  });

  return NextResponse.json({ chats: result });
}
