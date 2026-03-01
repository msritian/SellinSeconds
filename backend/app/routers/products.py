from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from app.auth import get_current_user
from app.supabase_client import supabase
from app.google_maps import calculate_distances_km
from app.services import match_products
from app.llm import conversational_search
from app.schemas import StatusBody

router = APIRouter(tags=["products"])


@router.get("/products/{product_id}")
def get_product(product_id: str):
    r = supabase.table("products").select("id, seller_id, item_name, description, price, status, location, media_urls, created_at").eq("id", product_id).single().execute()
    if not r.data:
        raise HTTPException(status_code=404, detail="Product not found")
    p = r.data
    seller = supabase.table("users").select("id, name").eq("id", p["seller_id"]).single().execute()
    ph = supabase.table("product_helpers").select("helper_id, quoted_fee").eq("product_id", product_id).execute()
    helpers = []
    if ph.data:
        ids = [x["helper_id"] for x in ph.data]
        profiles = supabase.table("helper_profiles").select("id, user_id, vehicle_type, lift_capacity_kg, location").in_("id", ids).execute()
        dest = p.get("location") or {}
        origins = [(x.get("location") or {}) for x in (profiles.data or [])]
        distances = calculate_distances_km(dest, origins) if origins and dest else []
        user_ids = [x["user_id"] for x in (profiles.data or [])]
        users = supabase.table("users").select("id, name").in_("id", user_ids).execute()
        user_map = {u["id"]: u["name"] for u in (users.data or [])}
        for i, hp in enumerate(profiles.data or []):
            fee = next((x["quoted_fee"] for x in ph.data if x["helper_id"] == hp["id"]), 0)
            dist = distances[i] if i < len(distances) else None
            helpers.append({
                "helper_id": hp["id"],
                "name": user_map.get(hp["user_id"], "Helper"),
                "vehicle_type": hp["vehicle_type"],
                "lift_capacity_kg": float(hp["lift_capacity_kg"]),
                "proximity_km": dist or 0,
                "assistance_level": "high" if float(hp.get("lift_capacity_kg", 0)) > 20 else "medium",
                "quoted_fee": float(fee),
            })
    return {
        "product_id": p["id"],
        "seller": {"user_id": p["seller_id"], "name": (seller.data or {}).get("name", "")},
        "item_name": p["item_name"],
        "description": p.get("description"),
        "price": float(p["price"]),
        "status": p["status"],
        "location": p["location"],
        "media_urls": p.get("media_urls") or [],
        "helpers": helpers,
        "helper_count": len(helpers),
        "created_at": p["created_at"],
    }


@router.get("/match_products")
def get_match_products(
    lat: float = Query(...),
    lng: float = Query(...),
    item_name: Optional[str] = Query(None),
    max_price: Optional[float] = Query(None),
    radius_km: float = Query(5.0),
    status: str = Query("available"),
):
    return match_products(lat=lat, lng=lng, item_name=item_name, max_price=max_price, radius_km=radius_km, status=status)


@router.get("/posts")
def get_posts(query: str = Query(...), current_user: dict = Depends(get_current_user)):
    def match_fn(lat: float, lng: float, item_name: Optional[str] = None, max_price: Optional[float] = None, radius_km: float = 5.0):
        return match_products(lat=lat, lng=lng, item_name=item_name, max_price=max_price, radius_km=radius_km)
    html = conversational_search(query, match_fn)
    from fastapi.responses import HTMLResponse
    return HTMLResponse(html)


@router.patch("/products/{product_id}/status")
def patch_product_status(product_id: str, body: StatusBody, current_user: dict = Depends(get_current_user)):
    if body.status != "sold":
        raise HTTPException(status_code=400, detail="status must be 'sold'")
    r = supabase.table("products").select("seller_id").eq("id", product_id).single().execute()
    if not r.data:
        raise HTTPException(status_code=404, detail="Product not found")
    if r.data["seller_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    up = supabase.table("products").update({"status": "sold"}).eq("id", product_id).execute()
    row = up.data[0] if up.data else None
    if not row:
        raise HTTPException(status_code=500, detail="Update failed")
    return {"product_id": row["id"], "status": row["status"]}
