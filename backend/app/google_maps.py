from typing import List, Optional
import httpx
from app.config import settings

GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json"
DISTANCE_MATRIX_URL = "https://maps.googleapis.com/maps/api/distancematrix/json"


def resolve_location(location_string: str) -> Optional[dict]:
    key = settings.google_maps_api_key
    if not key:
        return None
    with httpx.Client() as client:
        r = client.get(
            GEOCODING_URL,
            params={"address": location_string, "key": key},
        )
    if r.status_code != 200:
        return None
    data = r.json()
    if data.get("status") != "OK" or not data.get("results"):
        return None
    loc = data["results"][0].get("geometry", {}).get("location")
    if not loc:
        return None
    return {
        "lat": loc["lat"],
        "lng": loc["lng"],
        "formatted_address": data["results"][0].get("formatted_address"),
    }


def calculate_distances_km(
    origin: dict,
    destinations: List[dict],
) -> List[Optional[float]]:
    if not destinations:
        return []
    key = settings.google_maps_api_key
    if not key:
        return [None] * len(destinations)
    orig = f"{origin['lat']},{origin['lng']}"
    dest_str = "|".join(f"{d['lat']},{d['lng']}" for d in destinations)
    with httpx.Client() as client:
        r = client.get(
            DISTANCE_MATRIX_URL,
            params={"origins": orig, "destinations": dest_str, "key": key},
        )
    if r.status_code != 200:
        return [None] * len(destinations)
    data = r.json()
    if data.get("status") != "OK" or not data.get("rows"):
        return [None] * len(destinations)
    elements = data["rows"][0].get("elements", [])
    result = []
    for el in elements:
        if el.get("status") == "OK" and el.get("distance"):
            result.append(el["distance"]["value"] / 1000)
        else:
            result.append(None)
    return result
