import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";

interface Body {
  user_id: string;
  role: "helper" | "buyer" | "seller";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ chat_id: string }> }
) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { chat_id } = await params;
  const body: Body = await req.json();
  const { user_id, role } = body;

  if (!user_id || !role) {
    return NextResponse.json({ error: "user_id and role required" }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { data: existing } = await supabase
    .from("chat_participants")
    .select("user_id")
    .eq("chat_id", chat_id);
  const isParticipant = (existing as { user_id: string }[] | null)?.some((p) => p.user_id === user.id);
  if (!isParticipant) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase.from("chat_participants").upsert(
    { chat_id, user_id, role },
    { onConflict: "chat_id,user_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: participants } = await supabase
    .from("chat_participants")
    .select("user_id")
    .eq("chat_id", chat_id);
  return NextResponse.json({
    chat_id,
    participants: (participants as { user_id: string }[] | null)?.map((p) => p.user_id) ?? [],
    added_user_id: user_id,
  });
}
