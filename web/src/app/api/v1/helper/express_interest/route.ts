import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";

interface Body {
  helper_id: string;
  product_id: string;
  quoted_fee: number;
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body: Body = await req.json();
    const { helper_id, product_id, quoted_fee } = body;

    if (!helper_id || !product_id || typeof quoted_fee !== "number") {
      return NextResponse.json({ error: "helper_id, product_id, quoted_fee required" }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();
    const { data: profile } = await supabase
      .from("helper_profiles")
      .select("id")
      .eq("id", helper_id)
      .eq("user_id", user.id)
      .single();

    if (!profile) return NextResponse.json({ error: "Helper profile not found" }, { status: 404 });

    const { error } = await supabase.from("product_helpers").upsert(
      { product_id, helper_id, quoted_fee },
      { onConflict: "product_id,helper_id" }
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      status: "interest_registered",
      product_id,
      helper_id,
      quoted_fee,
    });
  } catch (e) {
    console.error("express_interest error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
