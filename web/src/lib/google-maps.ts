const GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const DISTANCE_MATRIX_URL = "https://maps.googleapis.com/maps/api/distancematrix/json";

function getApiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not set");
  return key;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  formatted_address?: string;
}

/** Resolve a location string (e.g. "Sellery Hall", "Madison WI") to coordinates using Google Geocoding API. */
export async function resolveLocation(locationString: string): Promise<GeocodeResult | null> {
  const key = getApiKey();
  const res = await fetch(
    `${GEOCODING_URL}?address=${encodeURIComponent(locationString)}&key=${key}`
  );
  const data = await res.json();
  if (data.status !== "OK" || !data.results?.[0]) return null;
  const loc = data.results[0].geometry?.location;
  const formatted = data.results[0].formatted_address;
  if (!loc) return null;
  return {
    lat: loc.lat,
    lng: loc.lng,
    formatted_address: formatted,
  };
}

/**
 * Get distance in km between origin and destination using Google Distance Matrix API.
 * Returns the first element's distance value in km.
 */
export async function calculateDistanceKm(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<number | null> {
  const key = getApiKey();
  const orig = `${origin.lat},${origin.lng}`;
  const dest = `${destination.lat},${destination.lng}`;
  const res = await fetch(
    `${DISTANCE_MATRIX_URL}?origins=${encodeURIComponent(orig)}&destinations=${encodeURIComponent(dest)}&key=${key}`
  );
  const data = await res.json();
  if (data.status !== "OK" || !data.rows?.[0]?.elements?.[0]) return null;
  const el = data.rows[0].elements[0];
  if (el.status !== "OK" || !el.distance) return null;
  return el.distance.value / 1000; // meters -> km
}

/**
 * Get distances from one origin to many destinations in one call (more efficient).
 * Returns array of distances in km in same order as destinations.
 */
export async function calculateDistancesKm(
  origin: { lat: number; lng: number },
  destinations: Array<{ lat: number; lng: number }>
): Promise<(number | null)[]> {
  if (destinations.length === 0) return [];
  const key = getApiKey();
  const orig = `${origin.lat},${origin.lng}`;
  const destStr = destinations.map((d) => `${d.lat},${d.lng}`).join("|");
  const res = await fetch(
    `${DISTANCE_MATRIX_URL}?origins=${encodeURIComponent(orig)}&destinations=${encodeURIComponent(destStr)}&key=${key}`
  );
  const data = await res.json();
  if (data.status !== "OK" || !data.rows?.[0]?.elements) return destinations.map(() => null);
  return data.rows[0].elements.map((el: { status: string; distance?: { value: number } }) =>
    el.status === "OK" && el.distance ? el.distance.value / 1000 : null
  );
}
