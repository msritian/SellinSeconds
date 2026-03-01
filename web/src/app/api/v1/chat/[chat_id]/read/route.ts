import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";

/**
 * PATCH /api/v1/chat/[chat_id]/read – Mark chat as read for the current user (updates last_read_at).
 */
export async function PATCH(
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

  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const { error } = await supabase
    .from("chat_participants")
    .update({ last_read_at: now })
    .eq("chat_id", chat_id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ chat_id, read_at: now });
}
