import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";

interface Body {
  buyer_id: string;
  helper_id: string;
  product_id: string;
  chat_id?: string;
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body: Body = await req.json();
    const { buyer_id, helper_id, product_id, chat_id } = body;

    if (!buyer_id || !helper_id || !product_id) {
      return NextResponse.json({ error: "buyer_id, helper_id, product_id required" }, { status: 400 });
    }
    if (user.id !== buyer_id) {
      return NextResponse.json({ error: "Only the buyer can accept a helper" }, { status: 403 });
    }

    const supabase = createSupabaseAdmin();
    const { data: profile } = await supabase
      .from("helper_profiles")
      .select("id, user_id, vehicle_type, default_quoted_fee")
      .eq("id", helper_id)
      .single();
    if (!profile) return NextResponse.json({ error: "Helper not found" }, { status: 404 });

    const { data: ph } = await supabase
      .from("product_helpers")
      .select("quoted_fee")
      .eq("product_id", product_id)
      .eq("helper_id", helper_id)
      .single();
    const quoted_fee = ph?.quoted_fee ?? profile.default_quoted_fee;

    const { data: seller } = await supabase.from("users").select("name").eq("id", profile.user_id).single();

    if (chat_id) {
      const { error: addErr } = await supabase.from("chat_participants").insert({
        chat_id,
        user_id: profile.user_id,
        role: "helper",
      });
      if (addErr && addErr.code !== "23505") {
        return NextResponse.json({ error: addErr.message }, { status: 500 });
      }
      return NextResponse.json({
        status: "helper_accepted",
        chat_id,
        accepted_helper: {
          helper_id: profile.id,
          name: seller?.name ?? "Helper",
          vehicle_type: profile.vehicle_type,
          quoted_fee: Number(quoted_fee),
        },
      });
    }

    await supabase.from("product_accepted_helpers").upsert(
      { product_id, buyer_id, helper_id },
      { onConflict: "product_id,buyer_id,helper_id" }
    );
    return NextResponse.json({
      status: "helper_accepted_pending_chat",
      chat_id: null,
      message: "Helper will be added to the chat when you start one with the seller.",
      accepted_helper: {
        helper_id: profile.id,
        name: seller?.name ?? "Helper",
        vehicle_type: profile.vehicle_type,
        quoted_fee: Number(quoted_fee),
      },
    });
  } catch (e) {
    console.error("helper accept error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
