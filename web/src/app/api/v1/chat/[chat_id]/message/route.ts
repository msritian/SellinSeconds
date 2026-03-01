import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";

interface Body {
  sender_id: string;
  content: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ chat_id: string }> }
) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { chat_id } = await params;
  const body: Body = await req.json();
  const { sender_id, content } = body;

  if (sender_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { data: participant } = await supabase
    .from("chat_participants")
    .select("user_id")
    .eq("chat_id", chat_id)
    .eq("user_id", user.id)
    .single();
  if (!participant) return NextResponse.json({ error: "Not a participant" }, { status: 403 });

  const { data: msg, error } = await supabase
    .from("messages")
    .insert({ chat_id, sender_id: user.id, content: content.trim() })
    .select("id, sent_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message_id: msg.id, sent_at: msg.sent_at }, { status: 201 });
}
