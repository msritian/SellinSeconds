from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from app.auth import get_current_user
from app.config import settings as app_settings
from app.supabase_client import supabase
from app.google_maps import calculate_distances_km, resolve_location_with_fallbacks
from app.llm import normalize_location_for_geocode
from app.schemas import HelperProfileBody, ExpressInterestBody, HelperAcceptBody

router = APIRouter(prefix="/helper", tags=["helper"])


@router.get("/geocode")
def geocode_address(
    address: str = Query(..., min_length=1),
    current_user: dict = Depends(get_current_user),
):
    """Resolve helper's location (free text) to lat/lng: LLM normalizes intent, then Google Maps Geocoding."""
    if not app_settings.google_maps_api_key:
        raise HTTPException(
            status_code=503,
            detail="Google Maps API is not configured. Set GOOGLE_MAPS_API_KEY in the backend.",
        )
    raw = address.strip()
    normalized = normalize_location_for_geocode(raw)
    result = resolve_location_with_fallbacks(normalized)
    if not result:
        result = resolve_location_with_fallbacks(raw)
    if not result:
        raise HTTPException(
            status_code=404,
            detail="Could not find that location. Try a city name (e.g. Chicago, Madison) or full address.",
        )
    return {
        "lat": result["lat"],
        "lng": result["lng"],
        "label": result.get("formatted_address") or normalized or raw,
    }


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
    existing = supabase.table("helper_profiles").select("id").eq("user_id", current_user["id"]).limit(1).execute()
    if existing.data and len(existing.data) > 0:
        row = existing.data[0]
        supabase.table("helper_profiles").update(profile_row).eq("id", row["id"]).execute()
        return {"helper_id": row["id"], "is_new": False, "profile": profile_row}
    ins = supabase.table("helper_profiles").insert(profile_row).execute()
    if not ins.data:
        raise HTTPException(status_code=500, detail="Failed to create profile")
    return {"helper_id": ins.data[0]["id"], "is_new": True, "profile": profile_row}


@router.get("/profile/{user_id}")
def get_helper_profile(user_id: str, current_user: dict = Depends(get_current_user)):
    if user_id != current_user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    r = supabase.table("helper_profiles").select("*").eq("user_id", user_id).limit(1).execute()
    if not r.data or len(r.data) == 0:
        raise HTTPException(status_code=404, detail="Helper profile not found")
    d = r.data[0]
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
    profile = supabase.table("helper_profiles").select("id, user_id, location").eq("user_id", current_user["id"]).limit(1).execute()
    if not profile.data or len(profile.data) == 0:
        raise HTTPException(status_code=404, detail="Helper profile not found")
    profile_row = profile.data[0]
    if helper_id and helper_id != profile_row["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    products = supabase.table("products").select("id, item_name, price, location, seller_id").eq("status", "available").execute()
    list_data = products.data or []
    if not list_data:
        return {"leads": []}
    origin = profile_row["location"] or {"lat": 0, "lng": 0}
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
    profile = supabase.table("helper_profiles").select("id").eq("id", body.helper_id).eq("user_id", current_user["id"]).limit(1).execute()
    if not profile.data or len(profile.data) == 0:
        raise HTTPException(status_code=404, detail="Helper profile not found")
    supabase.table("product_helpers").upsert({"product_id": body.product_id, "helper_id": body.helper_id, "quoted_fee": body.quoted_fee}, on_conflict="product_id,helper_id").execute()
    return {"status": "interest_registered", "product_id": body.product_id, "helper_id": body.helper_id, "quoted_fee": body.quoted_fee}


@router.post("/accept")
def accept_helper(body: HelperAcceptBody, current_user: dict = Depends(get_current_user)):
    if body.buyer_id != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the buyer can accept a helper")
    profile = supabase.table("helper_profiles").select("id, user_id, vehicle_type, default_quoted_fee").eq("id", body.helper_id).limit(1).execute()
    if not profile.data or len(profile.data) == 0:
        raise HTTPException(status_code=404, detail="Helper not found")
    profile_row = profile.data[0]
    ph = supabase.table("product_helpers").select("quoted_fee").eq("product_id", body.product_id).eq("helper_id", body.helper_id).limit(1).execute()
    quoted_fee = float(ph.data[0]["quoted_fee"]) if ph.data and len(ph.data) > 0 else float(profile_row.get("default_quoted_fee", 0))
    seller = supabase.table("users").select("name").eq("id", profile_row["user_id"]).limit(1).execute()
    seller_name = (seller.data[0].get("name", "Helper")) if seller.data and len(seller.data) > 0 else "Helper"
    supabase.table("chat_participants").upsert({"chat_id": body.chat_id, "user_id": profile_row["user_id"], "role": "helper"}, on_conflict="chat_id,user_id").execute()
    return {
        "status": "helper_accepted",
        "chat_id": body.chat_id,
        "accepted_helper": {
            "helper_id": profile_row["id"],
            "name": seller_name,
            "vehicle_type": profile_row["vehicle_type"],
            "quoted_fee": quoted_fee,
        },
    }
