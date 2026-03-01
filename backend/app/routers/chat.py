import json
import logging
from collections import defaultdict
from datetime import datetime, timezone
from urllib.parse import parse_qs

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from supabase import Client

from app.auth import get_current_user, get_user_from_token
from app.supabase_client import get_supabase, supabase
from app.schemas import ChatInitiateBody, ChatParticipantsBody, ChatMessageBody

router = APIRouter(prefix="/chat", tags=["chat"])
log = logging.getLogger(__name__)

# chat_id -> set of WebSocket connections (all participants in that chat)
_chat_rooms: dict[str, set[WebSocket]] = defaultdict(set)


@router.get("")
def list_my_chats(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """List all chats for the current user with product, other party, last message, and unread count.
    Uses batched queries to avoid N+1 (production-grade)."""
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

    # Single query: all messages in these chats (for last message + unread)
    all_msgs = (
        supabase.table("messages")
        .select("chat_id, sender_id, content, sent_at")
        .in_("chat_id", chat_ids)
        .order("sent_at", desc=True)
        .execute()
    )
    messages_by_chat = {}
    for m in (all_msgs.data or []):
        cid = m["chat_id"]
        if cid not in messages_by_chat:
            messages_by_chat[cid] = []
        messages_by_chat[cid].append(m)

    # Batch: other participants for all chats
    other_parts = (
        supabase.table("chat_participants")
        .select("chat_id, user_id, role")
        .in_("chat_id", chat_ids)
        .neq("user_id", current_user["id"])
        .execute()
    )
    other_by_chat = {}
    all_other_ids = set()
    for o in (other_parts.data or []):
        cid = o["chat_id"]
        if cid not in other_by_chat:
            other_by_chat[cid] = []
        other_by_chat[cid].append({"user_id": o["user_id"], "role": o["role"]})
        all_other_ids.add(o["user_id"])
    user_map = {}
    if all_other_ids:
        users = supabase.table("users").select("id, name").in_("id", list(all_other_ids)).execute()
        user_map = {u["id"]: u["name"] for u in (users.data or [])}

    result = []
    for ch in chats.data:
        chat_id = ch["id"]
        product_id = ch["product_id"]
        my_part = part_by_chat.get(chat_id)
        if not my_part:
            continue
        last_read = my_part.get("last_read_at")
        product = product_map.get(product_id)
        chat_messages = messages_by_chat.get(chat_id, [])

        last_message = None
        if chat_messages:
            m = chat_messages[0]
            last_message = {"sender_id": m["sender_id"], "content": (m.get("content") or "")[:100], "sent_at": m["sent_at"]}

        from_others = [m for m in chat_messages if m["sender_id"] != current_user["id"]]
        if last_read is None:
            unread_count = len(from_others)
        else:
            from_ts = last_read if isinstance(last_read, str) else last_read.isoformat()
            unread_count = sum(1 for m in from_others if (m.get("sent_at") or "") > from_ts)

        others = other_by_chat.get(chat_id, [])
        other_display = [{"user_id": o["user_id"], "name": user_map.get(o["user_id"], "?"), "role": o["role"]} for o in others]

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
    result.sort(key=lambda x: (x["last_message"] or {}).get("sent_at") or "", reverse=True)
    return {"chats": result}


@router.patch("/{chat_id}/read")
def mark_chat_read(
    chat_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
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
def initiate_chat(
    body: ChatInitiateBody,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    if current_user["id"] not in (body.buyer_id, body.seller_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        # Idempotent: return existing chat if buyer+seller already have one for this product
        existing_chats = supabase.table("chats").select("id").eq("product_id", body.product_id).execute()
        for c in (existing_chats.data or []):
            parts = supabase.table("chat_participants").select("user_id").eq("chat_id", c["id"]).execute()
            user_ids = {p["user_id"] for p in (parts.data or [])}
            if user_ids == {body.buyer_id, body.seller_id}:
                return {"chat_id": c["id"], "participants": [body.buyer_id, body.seller_id]}

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
def get_chat(
    chat_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    chat = supabase.table("chats").select("id, product_id").eq("id", chat_id).single().execute()
    if not chat.data:
        raise HTTPException(status_code=404, detail="Chat not found")
    part = supabase.table("chat_participants").select("user_id, role").eq("chat_id", chat_id).eq("user_id", current_user["id"]).single().execute()
    if not part.data:
        raise HTTPException(status_code=403, detail="Forbidden")
    product = supabase.table("products").select("id, item_name, price").eq("id", chat.data["product_id"]).single().execute()
    p = product.data if product.data else None
    finalize_state = None
    fi = supabase.table("finalize_intents").select("buyer_confirmed, seller_confirmed, hold_triggered").eq("chat_id", chat_id).eq("product_id", chat.data["product_id"]).limit(1).execute()
    if fi.data and len(fi.data) > 0:
        r = fi.data[0]
        finalize_state = {
            "buyer_confirmed": bool(r.get("buyer_confirmed")),
            "seller_confirmed": bool(r.get("seller_confirmed")),
            "hold_triggered": bool(r.get("hold_triggered")),
            "status": "both_confirmed" if (r.get("buyer_confirmed") and r.get("seller_confirmed")) else "pending",
        }
    return {
        "chat_id": chat.data["id"],
        "product_id": chat.data["product_id"],
        "my_role": part.data["role"],
        "product": {"product_id": p["id"], "item_name": p["item_name"], "price": float(p["price"])} if p else None,
        "finalize_state": finalize_state,
    }


@router.patch("/{chat_id}/participants")
def add_participant(
    chat_id: str,
    body: ChatParticipantsBody,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    parts = supabase.table("chat_participants").select("user_id").eq("chat_id", chat_id).execute()
    if not any(p["user_id"] == current_user["id"] for p in (parts.data or [])):
        raise HTTPException(status_code=403, detail="Forbidden")
    supabase.table("chat_participants").upsert({"chat_id": chat_id, "user_id": body.user_id, "role": body.role}, on_conflict="chat_id,user_id").execute()
    parts2 = supabase.table("chat_participants").select("user_id").eq("chat_id", chat_id).execute()
    return {"chat_id": chat_id, "participants": [p["user_id"] for p in (parts2.data or [])], "added_user_id": body.user_id}


@router.post("/{chat_id}/message")
def send_message(
    chat_id: str,
    body: ChatMessageBody,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
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
def get_messages(
    chat_id: str,
    limit: int = Query(500, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    part = supabase.table("chat_participants").select("user_id").eq("chat_id", chat_id).eq("user_id", current_user["id"]).single().execute()
    if not part.data:
        raise HTTPException(status_code=403, detail="Forbidden")
    r = supabase.table("messages").select("id, sender_id, content, sent_at").eq("chat_id", chat_id).order("sent_at").limit(limit).execute()
    return {"messages": r.data or []}


@router.websocket("/ws")
async def chat_websocket(websocket: WebSocket):
    """WebSocket for real-time chat. Query params: token=JWT, chat_id=UUID. Send JSON: { "type": "message", "content": "..." }."""
    await websocket.accept()
    query_string = websocket.scope.get("query_string", b"").decode()
    params = parse_qs(query_string)
    token = (params.get("token") or [None])[0]
    chat_id = (params.get("chat_id") or [None])[0]
    user = await get_user_from_token(token) if token else None
    if not user or not chat_id:
        await websocket.send_json({"type": "error", "message": "Invalid or missing token or chat_id"})
        await websocket.close(code=4001)
        return
    part = supabase.table("chat_participants").select("user_id").eq("chat_id", chat_id).eq("user_id", user["id"]).single().execute()
    if not part.data:
        await websocket.send_json({"type": "error", "message": "Not a participant"})
        await websocket.close(code=4003)
        return
    _chat_rooms[chat_id].add(websocket)
    try:
        await websocket.send_json({"type": "joined", "chat_id": chat_id})
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue
            if msg.get("type") == "finalize_update":
                buyer_confirmed = msg.get("buyer_confirmed") is True
                seller_confirmed = msg.get("seller_confirmed") is True
                hold_triggered = msg.get("hold_triggered") is True
                payload = {
                    "type": "finalize_update",
                    "buyer_confirmed": buyer_confirmed,
                    "seller_confirmed": seller_confirmed,
                    "hold_triggered": hold_triggered,
                    "status": "both_confirmed" if (buyer_confirmed and seller_confirmed) else "pending",
                }
                dead = set()
                for ws in _chat_rooms[chat_id]:
                    try:
                        await ws.send_json(payload)
                    except Exception:
                        dead.add(ws)
                for ws in dead:
                    _chat_rooms[chat_id].discard(ws)
                continue
            if msg.get("type") != "message" or not isinstance(msg.get("content"), str):
                continue
            content = msg["content"].strip()
            if not content:
                continue
            ins = supabase.table("messages").insert({
                "chat_id": chat_id,
                "sender_id": user["id"],
                "content": content,
            }).execute()
            if not ins.data:
                await websocket.send_json({"type": "error", "message": "Failed to save message"})
                continue
            row = ins.data[0]
            sent_at = row.get("sent_at")
            if hasattr(sent_at, "isoformat"):
                sent_at = sent_at.isoformat().replace("+00:00", "Z")
            payload = {
                "type": "message",
                "id": row["id"],
                "sender_id": user["id"],
                "content": content,
                "sent_at": sent_at,
            }
            dead = set()
            for ws in _chat_rooms[chat_id]:
                try:
                    await ws.send_json(payload)
                except Exception:
                    dead.add(ws)
            for ws in dead:
                _chat_rooms[chat_id].discard(ws)
    except WebSocketDisconnect:
        pass
    finally:
        _chat_rooms[chat_id].discard(websocket)
        if not _chat_rooms[chat_id]:
            del _chat_rooms[chat_id]
        try:
            await websocket.close()
        except Exception:
            pass
