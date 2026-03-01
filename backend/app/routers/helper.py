from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from app.auth import get_current_user
from app.supabase_client import supabase
from app.google_maps import calculate_distances_km
from app.schemas import HelperProfileBody, ExpressInterestBody, HelperAcceptBody

router = APIRouter(prefix="/helper", tags=["helper"])


@router.post("/profile")
def helper_profile(body: HelperProfileBody, current_user: dict = Depends(get_current_user)):
    if body.user_id != current_user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    loc = body.location
    profile_row = {
        "user_id": current_user["id"],
        "location": {"lat": loc.lat, "lng": loc.lng, "label": loc.label},
        "vehicle_type": body.vehicle_type,
        "lift_capacity_kg": body.lift_capacity_kg,
        "default_quoted_fee": body.default_quoted_fee,
        "assistance_notes": body.assistance_notes,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    existing = supabase.table("helper_profiles").select("id").eq("user_id", current_user["id"]).single().execute()
    if existing.data:
        supabase.table("helper_profiles").update(profile_row).eq("id", existing.data["id"]).execute()
        return {"helper_id": existing.data["id"], "is_new": False, "profile": profile_row}
    ins = supabase.table("helper_profiles").insert(profile_row).execute()
    if not ins.data:
        raise HTTPException(status_code=500, detail="Failed to create profile")
    return {"helper_id": ins.data[0]["id"], "is_new": True, "profile": profile_row}


@router.get("/profile/{user_id}")
def get_helper_profile(user_id: str, current_user: dict = Depends(get_current_user)):
    if user_id != current_user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    r = supabase.table("helper_profiles").select("*").eq("user_id", user_id).single().execute()
    if not r.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    d = r.data
    return {
        "helper_id": d["id"],
        "user_id": d["user_id"],
        "location": d["location"],
        "vehicle_type": d["vehicle_type"],
        "lift_capacity_kg": float(d["lift_capacity_kg"]),
        "default_quoted_fee": float(d["default_quoted_fee"]),
        "assistance_notes": d.get("assistance_notes"),
        "created_at": d["created_at"],
        "updated_at": d["updated_at"],
    }


@router.get("/leads")
def get_leads(
    helper_id: Optional[str] = Query(None),
    radius_km: float = Query(5.0),
    current_user: dict = Depends(get_current_user),
):
    profile = supabase.table("helper_profiles").select("id, user_id, location").eq("user_id", current_user["id"]).single().execute()
    if not profile.data:
        raise HTTPException(status_code=404, detail="Helper profile not found")
    if helper_id and helper_id != profile.data["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    products = supabase.table("products").select("id, item_name, price, location, seller_id").eq("status", "available").execute()
    list_data = products.data or []
    if not list_data:
        return {"leads": []}
    origin = profile.data["location"] or {"lat": 0, "lng": 0}
    destinations = [p.get("location") or {"lat": 0, "lng": 0} for p in list_data]
    distances = calculate_distances_km(origin, destinations)
    seller_ids = list({p["seller_id"] for p in list_data})
    sellers = supabase.table("users").select("id, name").in_("id", seller_ids).execute()
    seller_map = {s["id"]: s["name"] for s in (sellers.data or [])}
    leads = []
    for i, p in enumerate(list_data):
        dist = distances[i] if i < len(distances) else None
        if dist is not None and dist <= radius_km:
            leads.append({
                "product_id": p["id"],
                "item_name": p["item_name"],
                "pickup_location": p.get("location"),
                "distance_km": dist,
                "price": float(p["price"]),
                "seller": {"user_id": p["seller_id"], "name": seller_map.get(p["seller_id"], "")},
            })
    leads.sort(key=lambda x: x["distance_km"])
    return {"leads": leads}


@router.post("/express_interest")
def express_interest(body: ExpressInterestBody, current_user: dict = Depends(get_current_user)):
    profile = supabase.table("helper_profiles").select("id").eq("id", body.helper_id).eq("user_id", current_user["id"]).single().execute()
    if not profile.data:
        raise HTTPException(status_code=404, detail="Helper profile not found")
    supabase.table("product_helpers").upsert({"product_id": body.product_id, "helper_id": body.helper_id, "quoted_fee": body.quoted_fee}, on_conflict="product_id,helper_id").execute()
    return {"status": "interest_registered", "product_id": body.product_id, "helper_id": body.helper_id, "quoted_fee": body.quoted_fee}


@router.post("/accept")
def accept_helper(body: HelperAcceptBody, current_user: dict = Depends(get_current_user)):
    if body.buyer_id != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the buyer can accept a helper")
    profile = supabase.table("helper_profiles").select("id, user_id, vehicle_type, default_quoted_fee").eq("id", body.helper_id).single().execute()
    if not profile.data:
        raise HTTPException(status_code=404, detail="Helper not found")
    ph = supabase.table("product_helpers").select("quoted_fee").eq("product_id", body.product_id).eq("helper_id", body.helper_id).single().execute()
    quoted_fee = float(ph.data["quoted_fee"]) if ph.data else float(profile.data.get("default_quoted_fee", 0))
    seller = supabase.table("users").select("name").eq("id", profile.data["user_id"]).single().execute()
    supabase.table("chat_participants").upsert({"chat_id": body.chat_id, "user_id": profile.data["user_id"], "role": "helper"}, on_conflict="chat_id,user_id").execute()
    return {
        "status": "helper_accepted",
        "chat_id": body.chat_id,
        "accepted_helper": {
            "helper_id": profile.data["id"],
            "name": (seller.data or {}).get("name", "Helper"),
            "vehicle_type": profile.data["vehicle_type"],
            "quoted_fee": quoted_fee,
        },
    }
