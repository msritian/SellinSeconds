import json
import re
from openai import OpenAI
from app.config import settings

_openai: OpenAI | None = None


def _client() -> OpenAI | None:
    global _openai
    if _openai is None and settings.openai_api_key:
        _openai = OpenAI(api_key=settings.openai_api_key)
    return _openai


def extract_listing_from_text(description: str, default_location: dict | None = None) -> dict:
    loc = default_location or {"lat": 0, "lng": 0, "label": "Not specified"}
    loc_str = (
        f"Default location: {loc.get('label')} (lat: {loc.get('lat')}, lng: {loc.get('lng')}). "
        "Use this if the user does not specify a location."
        if default_location
        else "Extract location from the text if mentioned."
    )
    client = _client()
    if not client:
        return _fallback_extraction(description, default_location)
    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": f"You are a marketplace listing parser. Extract: item_name, description, price (number), location. {loc_str} "
                    "Respond with JSON only: item_name, description, price, location (object with lat, lng, label).",
                },
                {"role": "user", "content": description},
            ],
            response_format={"type": "json_object"},
        )
        raw = resp.choices[0].message.content if resp.choices else None
        if not raw:
            return _fallback_extraction(description, default_location)
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


def _fallback_extraction(description: str, default_location: dict | None) -> dict:
    loc = default_location or {"lat": 0, "lng": 0, "label": "Not specified"}
    m = re.search(r"\$?\s*(\d+(?:\.\d{2})?)", description)
    return {
        "item_name": "Item",
        "description": description,
        "price": float(m.group(1)) if m else 0,
        "location": loc,
        "media_urls": [],
    }


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
    """Use LLM tools to resolve location and call match_products_fn(lat, lng, item_name, max_price, radius_km). Return HTML."""
    client = _client()
    if not client:
        from app.google_maps import resolve_location
        coords = resolve_location("Madison WI") or {"lat": 43.0731, "lng": -89.4012}
        result = match_products_fn(lat=coords["lat"], lng=coords["lng"], radius_km=5)
        return render_product_cards_html(result.get("products", []))

    from app.google_maps import resolve_location

    tools = [
        {
            "type": "function",
            "function": {
                "name": "resolve_location",
                "description": "Resolve place name to lat/lng",
                "parameters": {
                    "type": "object",
                    "properties": {"location_string": {"type": "string"}},
                    "required": ["location_string"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "query_products",
                "description": "Search products by location and filters",
                "parameters": {
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
        },
    ]

    messages = [
        {"role": "system", "content": "You help buyers find listings. Use resolve_location for place names, then query_products with lat/lng and any item name or max price from the query."},
        {"role": "user", "content": query},
    ]

    lat, lng, item_name, max_price, radius_km = None, None, None, None, 5.0
    products = []

    for _ in range(5):
        resp = client.chat.completions.create(model="gpt-4o-mini", messages=messages, tools=tools, tool_choice="auto")
        msg = resp.choices[0].message if resp.choices else None
        if not msg or not getattr(msg, "tool_calls", None):
            break
        messages.append(msg)
        for tc in msg.tool_calls:
            name = tc.function.name
            args = json.loads(tc.function.arguments or "{}")
            if name == "resolve_location":
                loc = resolve_location(args.get("location_string", "Madison WI"))
                content = json.dumps({"lat": loc["lat"], "lng": loc["lng"]}) if loc else "null"
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
                content = json.dumps(result)
            else:
                content = "{}"
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": content})
    return render_product_cards_html(products)
