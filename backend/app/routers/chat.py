from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from app.auth import get_current_user
from app.supabase_client import supabase
from app.schemas import ChatInitiateBody, ChatParticipantsBody, ChatMessageBody

router = APIRouter(prefix="/chat", tags=["chat"])


@router.get("")
def list_my_chats(current_user: dict = Depends(get_current_user)):
    """List all chats for the current user with product, other party, last message, and unread count."""
    parts = (
        supabase.table("chat_participants")
        .select("chat_id, role, last_read_at")
        .eq("user_id", current_user["id"])
        .execute()
    )
    if not parts.data:
        return {"chats": []}
    chat_ids = [p["chat_id"] for p in parts.data]
    part_by_chat = {p["chat_id"]: p for p in parts.data}

    chats = supabase.table("chats").select("id, product_id").in_("id", chat_ids).execute()
    if not chats.data:
        return {"chats": []}
    product_ids = list({c["product_id"] for c in chats.data})
    products = supabase.table("products").select("id, item_name, price, status").in_("id", product_ids).execute()
    product_map = {p["id"]: p for p in (products.data or [])}

    result = []
    for ch in chats.data:
        chat_id = ch["id"]
        product_id = ch["product_id"]
        my_part = part_by_chat.get(chat_id)
        if not my_part:
            continue
        last_read = my_part.get("last_read_at")
        product = product_map.get(product_id)

        # Other participant(s) in this chat (for display name)
        other_parts = (
            supabase.table("chat_participants")
            .select("user_id, role")
            .eq("chat_id", chat_id)
            .neq("user_id", current_user["id"])
            .execute()
        )
        other_user_ids = [o["user_id"] for o in (other_parts.data or [])]
        other_roles = {o["user_id"]: o["role"] for o in (other_parts.data or [])}
        if other_user_ids:
            users = supabase.table("users").select("id, name").in_("id", other_user_ids).execute()
            user_map = {u["id"]: u["name"] for u in (users.data or [])}
            other_display = [
                {"user_id": uid, "name": user_map.get(uid, "?"), "role": other_roles.get(uid, "?")}
                for uid in other_user_ids
            ]
        else:
            other_display = []

        # Last message
        last_msg = (
            supabase.table("messages")
            .select("id, sender_id, content, sent_at")
            .eq("chat_id", chat_id)
            .order("sent_at", desc=True)
            .limit(1)
            .execute()
        )
        last_message = None
        if last_msg.data:
            m = last_msg.data[0]
            last_message = {
                "sender_id": m["sender_id"],
                "content": (m["content"] or "")[:100],
                "sent_at": m["sent_at"],
            }

        # Unread: messages in this chat where sender != me and (last_read_at is null or sent_at > last_read_at)
        msgs = (
            supabase.table("messages")
            .select("id, sender_id, sent_at")
            .eq("chat_id", chat_id)
            .neq("sender_id", current_user["id"])
            .execute()
        )
        unread_count = 0
        if msgs.data and last_read is None:
            unread_count = len(msgs.data)
        elif msgs.data and last_read:
            from_date = last_read if isinstance(last_read, str) else last_read.isoformat()
            unread_count = sum(1 for m in msgs.data if (m.get("sent_at") or "") > from_date)

        result.append({
            "chat_id": chat_id,
            "product": {
                "product_id": product_id,
                "item_name": (product or {}).get("item_name", "?"),
                "price": float((product or {}).get("price") or 0),
                "status": (product or {}).get("status", "available"),
            },
            "my_role": my_part["role"],
            "other_party": other_display,
            "last_message": last_message,
            "unread_count": unread_count,
        })
    # Sort by last message sent_at desc
    result.sort(key=lambda x: (x["last_message"] or {}).get("sent_at") or "", reverse=True)
    return {"chats": result}


@router.patch("/{chat_id}/read")
def mark_chat_read(chat_id: str, current_user: dict = Depends(get_current_user)):
    """Mark all messages in this chat as read for the current user."""
    part = (
        supabase.table("chat_participants")
        .select("user_id")
        .eq("chat_id", chat_id)
        .eq("user_id", current_user["id"])
        .single()
        .execute()
    )
    if not part.data:
        raise HTTPException(status_code=403, detail="Not a participant")
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    supabase.table("chat_participants").update({"last_read_at": now}).eq("chat_id", chat_id).eq("user_id", current_user["id"]).execute()
    return {"chat_id": chat_id, "read_at": now}


@router.post("/initiate")
def initiate_chat(body: ChatInitiateBody, current_user: dict = Depends(get_current_user)):
    if current_user["id"] not in (body.buyer_id, body.seller_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        ins = supabase.table("chats").insert({"product_id": body.product_id}).execute()
        if not ins.data:
            raise HTTPException(status_code=500, detail="Failed to create chat")
        chat_id = ins.data[0]["id"]
        part_ins = supabase.table("chat_participants").insert([
            {"chat_id": chat_id, "user_id": body.buyer_id, "role": "buyer"},
            {"chat_id": chat_id, "user_id": body.seller_id, "role": "seller"},
        ]).execute()
        if part_ins.data is None and getattr(part_ins, "errors", None):
            raise HTTPException(status_code=500, detail=f"Failed to add participants: {part_ins.errors}")
        parts = supabase.table("chat_participants").select("user_id").eq("chat_id", chat_id).execute()
        return {"chat_id": chat_id, "participants": [p["user_id"] for p in (parts.data or [])]}
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception("chat initiate failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{chat_id}")
def get_chat(chat_id: str, current_user: dict = Depends(get_current_user)):
    chat = supabase.table("chats").select("id, product_id").eq("id", chat_id).single().execute()
    if not chat.data:
        raise HTTPException(status_code=404, detail="Chat not found")
    part = supabase.table("chat_participants").select("user_id, role").eq("chat_id", chat_id).eq("user_id", current_user["id"]).single().execute()
    if not part.data:
        raise HTTPException(status_code=403, detail="Forbidden")
    product = supabase.table("products").select("id, item_name, price").eq("id", chat.data["product_id"]).single().execute()
    p = product.data if product.data else None
    return {
        "chat_id": chat.data["id"],
        "product_id": chat.data["product_id"],
        "my_role": part.data["role"],
        "product": {"product_id": p["id"], "item_name": p["item_name"], "price": float(p["price"])} if p else None,
    }


@router.patch("/{chat_id}/participants")
def add_participant(chat_id: str, body: ChatParticipantsBody, current_user: dict = Depends(get_current_user)):
    parts = supabase.table("chat_participants").select("user_id").eq("chat_id", chat_id).execute()
    if not any(p["user_id"] == current_user["id"] for p in (parts.data or [])):
        raise HTTPException(status_code=403, detail="Forbidden")
    supabase.table("chat_participants").upsert({"chat_id": chat_id, "user_id": body.user_id, "role": body.role}, on_conflict="chat_id,user_id").execute()
    parts2 = supabase.table("chat_participants").select("user_id").eq("chat_id", chat_id).execute()
    return {"chat_id": chat_id, "participants": [p["user_id"] for p in (parts2.data or [])], "added_user_id": body.user_id}


@router.post("/{chat_id}/message")
def send_message(chat_id: str, body: ChatMessageBody, current_user: dict = Depends(get_current_user)):
    if body.sender_id != current_user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    part = supabase.table("chat_participants").select("user_id").eq("chat_id", chat_id).eq("user_id", current_user["id"]).single().execute()
    if not part.data:
        raise HTTPException(status_code=403, detail="Not a participant")
    ins = supabase.table("messages").insert({"chat_id": chat_id, "sender_id": current_user["id"], "content": body.content.strip()}).execute()
    if not ins.data:
        raise HTTPException(status_code=500, detail="Failed to send")
    return {"message_id": ins.data[0]["id"], "sent_at": ins.data[0]["sent_at"]}


@router.get("/{chat_id}/messages")
def get_messages(chat_id: str, current_user: dict = Depends(get_current_user)):
    part = supabase.table("chat_participants").select("user_id").eq("chat_id", chat_id).eq("user_id", current_user["id"]).single().execute()
    if not part.data:
        raise HTTPException(status_code=403, detail="Forbidden")
    r = supabase.table("messages").select("id, sender_id, content, sent_at").eq("chat_id", chat_id).order("sent_at").execute()
    return {"messages": r.data or []}
