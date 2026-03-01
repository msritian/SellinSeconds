import OpenAI from "openai";
import { resolveLocation } from "./google-maps";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Call match_products API with structured params */
async function queryProducts(params: {
  item_name?: string;
  max_price?: number;
  lat: number;
  lng: number;
  radius_km?: number;
}): Promise<{ products: Array<Record<string, unknown>>; total: number }> {
  const url = new URL(`${BASE}/api/v1/match_products`);
  url.searchParams.set("lat", String(params.lat));
  url.searchParams.set("lng", String(params.lng));
  if (params.radius_km != null) url.searchParams.set("radius_km", String(params.radius_km));
  if (params.item_name) url.searchParams.set("item_name", params.item_name);
  if (params.max_price != null) url.searchParams.set("max_price", String(params.max_price));
  const res = await fetch(url.toString());
  if (!res.ok) return { products: [], total: 0 };
  return res.json();
}

export type ProductCardItem = {
  product_id: string;
  item_name: string;
  price: number;
  distance_km?: number | null;
  media_urls?: Array<{ url?: string; thumbnail_url?: string }>;
};

/** Build HTML snippet of product cards for chat */
export function renderProductCardsHtml(products: ProductCardItem[]): string {
  if (products.length === 0) {
    return '<div class="product-cards-empty">No matching listings found.</div>';
  }
  const cards = products.map((p) => {
    const thumb = p.media_urls?.[0]?.thumbnail_url ?? p.media_urls?.[0]?.url ?? "";
    const dist = p.distance_km != null ? ` · ${p.distance_km.toFixed(1)} km` : "";
    return `
<div class="product-card" data-product-id="${p.product_id}">
  <img src="${thumb}" alt="${p.item_name}" class="product-card-thumb" onerror="this.style.display='none'"/>
  <div class="product-card-body">
    <strong>${escapeHtml(p.item_name)}</strong> — $${Number(p.price).toFixed(2)}${dist}
    <a href="/products/${p.product_id}" class="product-card-link">View Details</a>
  </div>
</div>`;
  });
  return `<div class="product-cards">${cards.join("")}</div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Conversational search: parse query with LLM tools, call match_products, return HTML. */
export async function conversationalSearch(query: string): Promise<string> {
  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    {
      type: "function",
      function: {
        name: "resolve_location",
        description: "Resolve a place name or address (e.g. 'Sellery Hall', 'Madison WI') to latitude and longitude.",
        parameters: {
          type: "object",
          properties: {
            location_string: { type: "string", description: "The place name or address" },
          },
          required: ["location_string"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "query_products",
        description: "Search for products with optional filters. Call resolve_location first to get lat/lng from the user's message.",
        parameters: {
          type: "object",
          properties: {
            item_name: { type: "string", description: "Product type or name (e.g. TV, mini-fridge)" },
            max_price: { type: "number", description: "Maximum price" },
            lat: { type: "number", description: "Latitude of buyer location" },
            lng: { type: "number", description: "Longitude of buyer location" },
            radius_km: { type: "number", description: "Search radius in km", default: 5 },
          },
          required: ["lat", "lng"],
        },
      },
    },
  ];

  if (!openai) {
    const coords = await resolveLocation("Madison WI");
    const lat = coords?.lat ?? 43.0731;
    const lng = coords?.lng ?? -89.4012;
    const result = await queryProducts({ lat, lng, radius_km: 5 });
    return renderProductCardsHtml(result.products as ProductCardItem[]);
  }

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You help buyers find campus marketplace listings. The user will send a natural language query (e.g. "I need a mini-fridge near Slichter Hall under $50"). You must:
1. Use resolve_location to get coordinates for any location mentioned (e.g. "Slicher Hall", "Sellery", "Madison").
2. Use query_products with the resolved lat/lng, and extract item type and max price from the query.
3. After you get products, you will format them as HTML product cards (the assistant will do that). Just call the tools and respond briefly that you've found the listings.`,
    },
    { role: "user", content: query },
  ];

  let lat: number | null = null;
  let lng: number | null = null;
  let item_name: string | undefined;
  let max_price: number | undefined;
  const radius_km = 5;

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    tools,
    tool_choice: "auto",
  });

  let lastMessage = res.choices[0]?.message;
  let iterations = 0;
  const maxIterations = 5;

  while (lastMessage?.tool_calls?.length && iterations < maxIterations) {
    iterations++;
    const toolCalls = lastMessage.tool_calls;
    const toolResults: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] = [];

    for (const tc of toolCalls) {
      const name = tc.function.name;
      const args = JSON.parse(tc.function.arguments ?? "{}");
      if (name === "resolve_location") {
        const loc = await resolveLocation(args.location_string ?? "Madison WI");
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: loc ? JSON.stringify({ lat: loc.lat, lng: loc.lng, label: loc.formatted_address }) : "null",
        });
        if (loc) {
          lat = loc.lat;
          lng = loc.lng;
        }
      } else if (name === "query_products") {
        const result = await queryProducts({
          item_name: args.item_name ?? item_name,
          max_price: args.max_price ?? max_price,
          lat: args.lat ?? lat ?? 43.0731,
          lng: args.lng ?? lng ?? -89.4012,
          radius_km: args.radius_km ?? radius_km,
        });
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
    }

    messages.push(lastMessage);
    for (const tr of toolResults) messages.push(tr);

    const next = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools,
      tool_choice: "auto",
    });
    lastMessage = next.choices[0]?.message;
  }

  // Extract products from last tool result
  let products: Array<Record<string, unknown>> = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "tool" && typeof m.content === "string") {
      try {
        const parsed = JSON.parse(m.content);
        if (parsed.products) {
          products = parsed.products;
          break;
        }
      } catch {
        // ignore
      }
    }
  }

  return renderProductCardsHtml(products as ProductCardItem[]);
}
