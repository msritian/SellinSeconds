import OpenAI from "openai";
import type { ExtractedListing, LocationInput } from "./types";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/** Extract listing fields from seller's text description. Optionally include location from form. */
export async function extractListingFromText(
  description: string,
  defaultLocation?: LocationInput
): Promise<ExtractedListing> {
  if (!openai) {
    return getFallbackExtraction(description, defaultLocation);
  }
  const locStr = defaultLocation
    ? `Default location: ${defaultLocation.label} (lat: ${defaultLocation.lat}, lng: ${defaultLocation.lng}). Use this if the user does not specify a location.`
    : "Extract location from the text if mentioned (e.g. 'pickup at Doty St', 'near Sellery Hall').";
  const sys = `You are a marketplace listing parser. Extract from the user's message: item_name, description (full item description), price (number only), and location.
${locStr}
Respond with a JSON object only, no markdown, with keys: item_name, description, price, location.
location must be an object: { "lat": number, "lng": number, "label": string }. If no location is given, use default if provided; otherwise use { "lat": 0, "lng": 0, "label": "Not specified" }.`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: sys },
      { role: "user", content: description },
    ],
    response_format: { type: "json_object" },
  });
  const raw = res.choices[0]?.message?.content;
  if (!raw) return getFallbackExtraction(description, defaultLocation);
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const loc = (parsed.location as LocationInput) ?? defaultLocation ?? { lat: 0, lng: 0, label: "Not specified" };
    return {
      item_name: String(parsed.item_name ?? "Item"),
      description: String(parsed.description ?? description),
      price: Number(parsed.price) || 0,
      location: {
        lat: Number(loc.lat) ?? 0,
        lng: Number(loc.lng) ?? 0,
        label: String(loc.label ?? "Not specified"),
      },
      media_urls: [],
    };
  } catch {
    return getFallbackExtraction(description, defaultLocation);
  }
}

function getFallbackExtraction(
  description: string,
  defaultLocation?: LocationInput
): ExtractedListing {
  const loc = defaultLocation ?? { lat: 0, lng: 0, label: "Not specified" };
  const priceMatch = description.match(/\$?\s*(\d+(?:\.\d{2})?)/);
  return {
    item_name: "Item",
    description,
    price: priceMatch ? parseFloat(priceMatch[1]) : 0,
    location: loc,
    media_urls: [],
  };
}

/** Generate markdown preview table from extracted fields */
export function toMarkdownPreview(extracted: ExtractedListing): string {
  return [
    "| Field | Value |",
    "|-------|-------|",
    `| Item Name | ${extracted.item_name} |`,
    `| Description | ${extracted.description} |`,
    `| Price | $${extracted.price} |`,
    `| Location | ${extracted.location.label} |`,
  ].join("\n");
}
