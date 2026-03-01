import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import type { LocationInput, MediaUrlItem } from "@/lib/types";

interface ConfirmBody {
  draft_id: string;
  item_name: string;
  description: string;
  price: number;
  location: LocationInput;
  media_urls: string[];
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body: ConfirmBody = await req.json();
    const { draft_id, item_name, description, price, location, media_urls } = body;

    if (!draft_id || !item_name || typeof price !== "number") {
      return NextResponse.json({ error: "draft_id, item_name, and price are required" }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();
    const { data: draft, error: draftErr } = await supabase
      .from("listing_drafts")
      .select("id, user_id")
      .eq("id", draft_id)
      .eq("user_id", user.id)
      .single();

    if (draftErr || !draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    const mediaUrlsStructured: MediaUrlItem[] = (media_urls || []).map((url) => ({
      url,
      thumbnail_url: url,
      media_type: url.match(/\.(mp4|webm|mov)$/i) ? "video" : "image",
    }));

    const { data: product, error: insertErr } = await supabase
      .from("products")
      .insert({
        seller_id: user.id,
        item_name: String(item_name),
        description: String(description ?? ""),
        price,
        status: "available",
        location: {
          lat: location.lat,
          lng: location.lng,
          label: location.label,
        },
        media_urls: mediaUrlsStructured,
      })
      .select("id, status, created_at")
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    await supabase.from("listing_drafts").delete().eq("id", draft_id);

    return NextResponse.json(
      {
        product_id: product.id,
        status: product.status,
        created_at: product.created_at,
      },
      { status: 201 }
    );
  } catch (e) {
    console.error("confirm_listing error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
