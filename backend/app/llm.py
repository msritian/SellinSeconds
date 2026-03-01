import json
import re
from typing import Optional, List
from anthropic import Anthropic
from app.config import settings

_client: Optional[Anthropic] = None


def _get_client() -> Optional[Anthropic]:
    global _client
    if _client is None and settings.anthropic_api_key:
        _client = Anthropic(api_key=settings.anthropic_api_key)
    return _client


def extract_listing_from_text(description: str, default_location: Optional[dict] = None) -> dict:
    loc = default_location or {"lat": 0, "lng": 0, "label": "Not specified"}
    loc_str = (
        f"Default location: {loc.get('label')} (lat: {loc.get('lat')}, lng: {loc.get('lng')}). "
        "Use this if the user does not specify a location."
        if default_location
        else "Extract location from the text if mentioned."
    )
    client = _get_client()
    if not client:
        return _fallback_extraction(description, default_location)
    try:
        resp = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=1024,
            system=f"You are a marketplace listing parser. Extract: item_name, description, price (number), location. {loc_str} "
            "Respond with valid JSON only, no markdown or extra text. Keys: item_name, description, price, location (object with lat, lng, label).",
            messages=[{"role": "user", "content": description}],
        )
        raw = None
        for block in getattr(resp, "content", []):
            if getattr(block, "type", None) == "text":
                raw = getattr(block, "text", None)
                break
        if not raw:
            return _fallback_extraction(description, default_location)
        # Strip markdown code block if present
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw.rsplit("```", 1)[0].strip()
        parsed = json.loads(raw)
        loc_out = parsed.get("location") or loc
        return {
            "item_name": str(parsed.get("item_name", "Item")),
            "description": str(parsed.get("description", description)),
            "price": float(parsed.get("price", 0)) or 0,
            "location": {
                "lat": float(loc_out.get("lat", 0)),
                "lng": float(loc_out.get("lng", 0)),
                "label": str(loc_out.get("label", "Not specified")),
            },
            "media_urls": [],
        }
    except Exception:
        return _fallback_extraction(description, default_location)


def _fallback_extraction(description: str, default_location: Optional[dict]) -> dict:
    loc = default_location or {"lat": 0, "lng": 0, "label": "Not specified"}
    m = re.search(r"\$?\s*(\d+(?:\.\d{2})?)", description)
    return {
        "item_name": "Item",
        "description": description,
        "price": float(m.group(1)) if m else 0,
        "location": loc,
        "media_urls": [],
    }


def normalize_location_for_geocode(user_input: str) -> str:
    """Use LLM to turn helper's free-text location into a single-line address for Google Geocoding."""
    s = (user_input or "").strip()
    if not s:
        return "USA"
    client = _get_client()
    if not client:
        return s
    try:
        resp = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=128,
            system="You convert a user's location description into a single line address suitable for Google Geocoding. "
            "Output only the address, nothing else. Examples: 'Chicago' -> 'Chicago, IL, USA'; "
            "'downtown madison' -> 'Madison, WI, USA'; 'Sellery Hall' -> 'Sellery Hall, Madison, WI, USA'. "
            "Prefer US addresses; include city and state when possible.",
            messages=[{"role": "user", "content": s}],
        )
        raw = None
        for block in getattr(resp, "content", []):
            if getattr(block, "type", None) == "text":
                raw = getattr(block, "text", None)
                break
        if raw and raw.strip():
            return raw.strip()
    except Exception:
        pass
    return s


def to_markdown_preview(extracted: dict) -> str:
    return (
        "| Field | Value |\n|-------|-------|\n"
        f"| Item Name | {extracted['item_name']} |\n"
        f"| Description | {extracted['description']} |\n"
        f"| Price | ${extracted['price']} |\n"
        f"| Location | {extracted['location']['label']} |\n"
    )


def _escape_html(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def render_product_cards_html(products: list[dict]) -> str:
    if not products:
        return '<div class="product-cards-empty">No matching listings found.</div>'
    cards = []
    for p in products:
        thumb = ""
        if p.get("media_urls"):
            m = p["media_urls"][0] if isinstance(p["media_urls"][0], dict) else {}
            thumb = m.get("thumbnail_url") or m.get("url") or ""
        dist = f" · {p['distance_km']:.1f} km" if p.get("distance_km") is not None else ""
        cards.append(
            f'<div class="product-card" data-product-id="{p["product_id"]}">'
            f'<img src="{thumb}" alt="{_escape_html(p.get("item_name", ""))}" class="product-card-thumb" onerror="this.style.display=\'none\'"/>'
            f'<div class="product-card-body"><strong>{_escape_html(p.get("item_name", ""))}</strong> — ${float(p.get("price", 0)):.2f}{dist} '
            f'<a href="/products/{p["product_id"]}" class="product-card-link">View Details</a></div></div>'
        )
    return f'<div class="product-cards">{"".join(cards)}</div>'


def conversational_search(query: str, match_products_fn) -> str:
    """Use Claude with tools to resolve location and call match_products_fn. Return HTML."""
    client = _get_client()
    if not client:
        from app.google_maps import resolve_location
        coords = resolve_location("Madison WI") or {"lat": 43.0731, "lng": -89.4012}
        result = match_products_fn(lat=coords["lat"], lng=coords["lng"], radius_km=5)
        return render_product_cards_html(result.get("products", []))

    from app.google_maps import resolve_location

    tools = [
        {
            "name": "resolve_location",
            "description": "Resolve a place name or address to latitude and longitude.",
            "input_schema": {
                "type": "object",
                "properties": {"location_string": {"type": "string", "description": "Place name or address"}},
                "required": ["location_string"],
            },
        },
        {
            "name": "query_products",
            "description": "Search products by location and optional filters (item name, max price, radius in km).",
            "input_schema": {
                "type": "object",
                "properties": {
                    "item_name": {"type": "string"},
                    "max_price": {"type": "number"},
                    "lat": {"type": "number"},
                    "lng": {"type": "number"},
                    "radius_km": {"type": "number"},
                },
                "required": ["lat", "lng"],
            },
        },
    ]

    messages: List[dict] = [
        {"role": "user", "content": query},
    ]

    lat, lng, item_name, max_price, radius_km = None, None, None, None, 5.0
    products: List[dict] = []

    for _ in range(5):
        resp = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=1024,
            tools=tools,
            messages=messages,
        )
        content = getattr(resp, "content", [])
        tool_uses = [b for b in content if getattr(b, "type", None) == "tool_use"]
        if not tool_uses:
            break

        # Append assistant message (with tool_use blocks)
        assistant_content = [{"type": b.type, "id": b.id, "name": b.name, "input": b.input} for b in tool_uses]
        messages.append({"role": "assistant", "content": assistant_content})

        # Build tool results and append as user message
        tool_results = []
        for b in tool_uses:
            name = getattr(b, "name", "")
            bid = getattr(b, "id", "")
            args = getattr(b, "input", {}) or {}
            if name == "resolve_location":
                loc = resolve_location(args.get("location_string", "Madison WI"))
                tool_results.append({"type": "tool_result", "tool_use_id": bid, "content": json.dumps({"lat": loc["lat"], "lng": loc["lng"]}) if loc else "null"})
                if loc:
                    lat, lng = loc["lat"], loc["lng"]
            elif name == "query_products":
                result = match_products_fn(
                    lat=args.get("lat") or lat or 43.0731,
                    lng=args.get("lng") or lng or -89.4012,
                    item_name=args.get("item_name") or item_name,
                    max_price=args.get("max_price") or max_price,
                    radius_km=args.get("radius_km") or radius_km,
                )
                products = result.get("products", [])
                tool_results.append({"type": "tool_result", "tool_use_id": bid, "content": json.dumps(result)})
            else:
                tool_results.append({"type": "tool_result", "tool_use_id": bid, "content": "{}"})
        messages.append({"role": "user", "content": tool_results})

    return render_product_cards_html(products)
