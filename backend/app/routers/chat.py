from fastapi import APIRouter, Depends, HTTPException
from app.auth import get_current_user
from app.supabase_client import supabase
from app.schemas import ChatInitiateBody, ChatParticipantsBody, ChatMessageBody

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/initiate")
def initiate_chat(body: ChatInitiateBody, current_user: dict = Depends(get_current_user)):
    if current_user["id"] not in (body.buyer_id, body.seller_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    ins = supabase.table("chats").insert({"product_id": body.product_id}).execute()
    if not ins.data:
        raise HTTPException(status_code=500, detail="Failed to create chat")
    chat_id = ins.data[0]["id"]
    supabase.table("chat_participants").insert([
        {"chat_id": chat_id, "user_id": body.buyer_id, "role": "buyer"},
        {"chat_id": chat_id, "user_id": body.seller_id, "role": "seller"},
    ]).execute()
    parts = supabase.table("chat_participants").select("user_id").eq("chat_id", chat_id).execute()
    return {"chat_id": chat_id, "participants": [p["user_id"] for p in (parts.data or [])]}


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
