import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { extractListingFromText, toMarkdownPreview } from "@/lib/llm";
import type { LocationInput } from "@/lib/types";

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const description = (formData.get("description") as string) ?? "";
    const locationStr = formData.get("location") as string;
    const userId = formData.get("user_id") as string;
    if (userId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    let location: LocationInput | null = null;
    if (locationStr) {
      try {
        location = JSON.parse(locationStr) as LocationInput;
      } catch {
        // ignore
      }
    }

    const supabase = createSupabaseAdmin();
    const { data: userRow } = await supabase
      .from("users")
      .select("approximate_location")
      .eq("id", user.id)
      .single();
    const defaultLocation = (userRow?.approximate_location as LocationInput) ?? location ?? undefined;

    const files: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key === "files" && value instanceof File) files.push(value);
      else if (key.startsWith("files[") && value instanceof File) files.push(value);
    }
    if (!formData.has("files")) {
      const f = formData.get("file") ?? formData.get("image") ?? formData.get("video");
      if (f instanceof File) files.push(f);
    }

    const bucket = "listings";
    const mediaUrls: string[] = [];
    const basePath = `${user.id}/${Date.now()}`;

    for (const file of files) {
      if (!file.size) continue;
      const ext = file.name.split(".").pop() || "bin";
      const name = `${basePath}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from(bucket).upload(name, file, {
        contentType: file.type,
        upsert: false,
      });
      if (uploadError) {
        console.error("upload error", uploadError);
        continue;
      }
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(name);
      mediaUrls.push(urlData.publicUrl);
    }

    const extracted = await extractListingFromText(description, defaultLocation ?? undefined);
    extracted.media_urls = mediaUrls;
    const markdown_preview = toMarkdownPreview(extracted);

    const { data: draft, error: draftError } = await supabase
      .from("listing_drafts")
      .insert({
        user_id: user.id,
        extracted,
        markdown_preview,
        media_urls: mediaUrls,
      })
      .select("id")
      .single();

    if (draftError) {
      return NextResponse.json({ error: draftError.message }, { status: 500 });
    }

    return NextResponse.json({
      draft_id: draft.id,
      markdown_preview,
      default_location: defaultLocation ?? extracted.location,
      extracted: {
        item_name: extracted.item_name,
        description: extracted.description,
        price: extracted.price,
        location: extracted.location,
        media_urls: mediaUrls,
      },
    });
  } catch (e) {
    console.error("upload_listing error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
