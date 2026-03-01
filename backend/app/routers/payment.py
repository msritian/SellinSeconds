from fastapi import APIRouter, Depends, HTTPException
from app.auth import get_current_user
from app.supabase_client import supabase
from app.schemas import FinalizeIntentBody, PaymentHoldBody, PaymentReleaseBody

router = APIRouter(prefix="/payment", tags=["payment"])


@router.post("/finalize_intent")
def finalize_intent(body: FinalizeIntentBody, current_user: dict = Depends(get_current_user)):
    if body.confirmed_by != current_user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    existing = supabase.table("finalize_intents").select("*").eq("chat_id", body.chat_id).eq("product_id", body.product_id).execute()
    row = existing.data[0] if existing.data else None
    if row:
        updates = {}
        if body.role == "buyer":
            updates["buyer_confirmed"] = True
        if body.role == "seller":
            updates["seller_confirmed"] = True
        if row.get("buyer_confirmed") and row.get("seller_confirmed"):
            updates["hold_triggered"] = True
            supabase.table("payment_holds").insert({
                "buyer_id": row["buyer_id"],
                "product_id": body.product_id,
                "chat_id": body.chat_id,
                "amount": row["amount"],
                "status": "held",
            }).execute()
        supabase.table("finalize_intents").update(updates).eq("id", row["id"]).execute()
        row = {**row, **updates}
    else:
        parts = supabase.table("chat_participants").select("user_id, role").eq("chat_id", body.chat_id).execute()
        buyer = next((p["user_id"] for p in (parts.data or []) if p["role"] == "buyer"), None)
        seller = next((p["user_id"] for p in (parts.data or []) if p["role"] == "seller"), None)
        if not buyer or not seller:
            raise HTTPException(status_code=400, detail="Invalid chat")
        buyer_confirmed = body.role == "buyer"
        seller_confirmed = body.role == "seller"
        hold_triggered = buyer_confirmed and seller_confirmed
        ins = supabase.table("finalize_intents").insert({
            "chat_id": body.chat_id,
            "product_id": body.product_id,
            "buyer_id": buyer,
            "seller_id": seller,
            "buyer_confirmed": buyer_confirmed,
            "seller_confirmed": seller_confirmed,
            "amount": body.amount,
            "hold_triggered": hold_triggered,
        }).execute()
        if not ins.data:
            raise HTTPException(status_code=500, detail="Failed to create intent")
        row = ins.data[0]
        if hold_triggered:
            supabase.table("payment_holds").insert({
                "buyer_id": buyer,
                "product_id": body.product_id,
                "chat_id": body.chat_id,
                "amount": body.amount,
                "status": "held",
            }).execute()
    return {
        "finalize_intent_id": row["id"],
        "buyer_confirmed": row.get("buyer_confirmed", False),
        "seller_confirmed": row.get("seller_confirmed", False),
        "status": "both_confirmed" if (row.get("buyer_confirmed") and row.get("seller_confirmed")) else "pending",
        "hold_triggered": row.get("hold_triggered", False),
    }


@router.post("/hold")
def create_hold(body: PaymentHoldBody, current_user: dict = Depends(get_current_user)):
    part = supabase.table("chat_participants").select("user_id").eq("chat_id", body.chat_id).eq("user_id", current_user["id"]).single().execute()
    if not part.data:
        raise HTTPException(status_code=403, detail="Forbidden")
    ins = supabase.table("payment_holds").insert({
        "buyer_id": body.buyer_id,
        "product_id": body.product_id,
        "chat_id": body.chat_id,
        "amount": body.amount,
        "status": "held",
    }).execute()
    if not ins.data:
        raise HTTPException(status_code=500, detail="Failed to create hold")
    h = ins.data[0]
    return {"hold_id": h["id"], "status": h["status"], "amount": float(h["amount"])}


@router.post("/release")
def release_payment(body: PaymentReleaseBody, current_user: dict = Depends(get_current_user)):
    if body.confirmed_by != current_user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    hold = supabase.table("payment_holds").select("id, buyer_id, product_id, chat_id, amount, status").eq("id", body.hold_id).single().execute()
    if not hold.data:
        raise HTTPException(status_code=404, detail="Hold not found")
    h = hold.data
    if h["buyer_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only buyer can release")
    if h["status"] != "held":
        raise HTTPException(status_code=400, detail="Hold already released")
    product = supabase.table("products").select("seller_id").eq("id", h["product_id"]).single().execute()
    ph = supabase.table("product_helpers").select("helper_id, quoted_fee").eq("product_id", h["product_id"]).limit(1).execute()
    helper_amount = float(ph.data[0]["quoted_fee"]) if ph.data else 0
    helper_profile = supabase.table("helper_profiles").select("user_id").eq("id", ph.data[0]["helper_id"]).single().execute() if ph.data else None
    helper_id = helper_profile.data["user_id"] if (helper_profile and helper_profile.data) else None
    seller_id = product.data["seller_id"] if product.data else None
    seller_amount = float(h["amount"]) - helper_amount
    supabase.table("payment_holds").update({"status": "released"}).eq("id", body.hold_id).execute()
    return {
        "status": "released",
        "distributed_to": {
            "seller_id": seller_id,
            "seller_amount": seller_amount,
            "helper_id": helper_id,
            "helper_amount": helper_amount,
        },
    }
