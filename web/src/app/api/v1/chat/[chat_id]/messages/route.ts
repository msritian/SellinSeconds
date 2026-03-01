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
  const { data: participant } = await supabase
    .from("chat_participants")
    .select("user_id")
    .eq("chat_id", chat_id)
    .eq("user_id", user.id)
    .single();
  if (!participant) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: messages, error } = await supabase
    .from("messages")
    .select("id, sender_id, content, sent_at")
    .eq("chat_id", chat_id)
    .order("sent_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ messages: messages ?? [] });
}
