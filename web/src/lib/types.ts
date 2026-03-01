// Shared types for Campus Marketplace API

export interface LocationInput {
  lat: number;
  lng: number;
  label: string;
}

export interface MediaUrlItem {
  url: string;
  thumbnail_url: string;
  media_type: "image" | "video";
}

export interface UserPublic {
  user_id: string;
  name: string;
  email: string;
  created_at?: string;
}

export interface ExtractedListing {
  item_name: string;
  description: string;
  price: number;
  location: LocationInput;
  media_urls: string[];
}

export interface HelperProfileRow {
  helper_id: string;
  user_id: string;
  location: LocationInput;
  vehicle_type: string;
  lift_capacity_kg: number;
  default_quoted_fee: number;
  assistance_notes?: string;
  is_new?: boolean;
}

export interface ProductHelperView {
  helper_id: string;
  name: string;
  vehicle_type: string;
  lift_capacity_kg: number;
  proximity_km: number;
  assistance_level: string;
  quoted_fee: number;
}
