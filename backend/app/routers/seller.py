import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from app.auth import get_current_user
from app.supabase_client import supabase
from app.llm import extract_listing_from_text, to_markdown_preview
from app.schemas import ConfirmListingBody

router = APIRouter(prefix="/seller", tags=["seller"])


@router.post("/upload_listing")
async def upload_listing(
    current_user: dict = Depends(get_current_user),
    description: str = Form(""),
    location: str = Form(None),
    user_id: str = Form(...),
    files: list[UploadFile] = File(default=[]),
):
    if user_id != current_user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    loc = None
    if location:
        try:
            import json
            loc = json.loads(location)
        except Exception:
            pass
    # Get default location from user
    r = supabase.table("users").select("approximate_location").eq("id", current_user["id"]).single().execute()
    default_loc = (r.data or {}).get("approximate_location") if r.data else None
    if not default_loc and loc:
        default_loc = loc
    media_urls = []
    base_path = f"{current_user['id']}/{uuid.uuid4().hex[:12]}"
    for f in files:
        if not f.filename or not f.size:
            continue
        ext = f.filename.split(".")[-1] if "." in f.filename else "bin"
        path = f"{base_path}/{uuid.uuid4().hex}.{ext}"
        content = await f.read()
        supabase.storage.from_("listings").upload(path, content, {"content-type": f.content_type or "application/octet-stream"})
        url = supabase.storage.from_("listings").get_public_url(path)
        media_urls.append(url)
    extracted = extract_listing_from_text(description, default_loc)
    extracted["media_urls"] = media_urls
    markdown_preview = to_markdown_preview(extracted)
    draft = supabase.table("listing_drafts").insert({
        "user_id": current_user["id"],
        "extracted": extracted,
        "markdown_preview": markdown_preview,
        "media_urls": media_urls,
    }).execute()
    draft_id = draft.data[0]["id"] if draft.data else None
    if not draft_id:
        raise HTTPException(status_code=500, detail="Failed to create draft")
    return {
        "draft_id": draft_id,
        "markdown_preview": markdown_preview,
        "default_location": default_loc or extracted["location"],
        "extracted": {
            "item_name": extracted["item_name"],
            "description": extracted["description"],
            "price": extracted["price"],
            "location": extracted["location"],
            "media_urls": media_urls,
        },
    }


@router.post("/confirm_listing")
def confirm_listing(body: ConfirmListingBody, current_user: dict = Depends(get_current_user)):
    draft = supabase.table("listing_drafts").select("id, user_id").eq("id", body.draft_id).eq("user_id", current_user["id"]).single().execute()
    if not draft.data:
        raise HTTPException(status_code=404, detail="Draft not found")
    media_urls_struct = [{"url": u, "thumbnail_url": u, "media_type": "video" if u.lower().endswith((".mp4", ".webm", ".mov")) else "image"} for u in (body.media_urls or [])]
    loc = body.location
    ins = supabase.table("products").insert({
        "seller_id": current_user["id"],
        "item_name": body.item_name,
        "description": body.description,
        "price": body.price,
        "status": "available",
        "location": {"lat": loc.lat, "lng": loc.lng, "label": loc.label},
        "media_urls": media_urls_struct,
    }).execute()
    if not ins.data:
        raise HTTPException(status_code=500, detail="Failed to publish")
    product = ins.data[0]
    supabase.table("listing_drafts").delete().eq("id", body.draft_id).execute()
    return {"product_id": product["id"], "status": product["status"], "created_at": product["created_at"]}
