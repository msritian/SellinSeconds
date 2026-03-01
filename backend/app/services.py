"""Internal services used by routers (e.g. match_products logic)."""
from typing import Optional
from app.supabase_client import supabase
from app.google_maps import calculate_distances_km


def match_products(
    lat: float,
    lng: float,
    item_name: Optional[str] = None,
    max_price: Optional[float] = None,
    radius_km: float = 5.0,
    status: str = "available",
) -> dict:
    q = supabase.table("products").select("id, item_name, price, location, media_urls, status").eq("status", status)
    if item_name and item_name.strip():
        q = q.ilike("item_name", f"%{item_name.strip()}%")
    if max_price is not None:
        q = q.lte("price", max_price)
    r = q.execute()
    products = r.data or []
    if not products:
        return {"products": [], "total": 0}
    origin = {"lat": lat, "lng": lng}
    destinations = [p.get("location") or {"lat": 0, "lng": 0} for p in products]
    distances = calculate_distances_km(origin, destinations)
    out = []
    for i, p in enumerate(products):
        dist = distances[i] if i < len(distances) else None
        if dist is not None and dist <= radius_km:
            out.append({
                "product_id": p["id"],
                "item_name": p["item_name"],
                "price": float(p["price"]),
                "location": p["location"],
                "media_urls": p.get("media_urls") or [],
                "status": p["status"],
                "distance_km": dist,
            })
    out.sort(key=lambda x: x["distance_km"] or 0)
    return {"products": out, "total": len(out)}
