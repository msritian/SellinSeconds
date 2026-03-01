"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/app/providers";
import { LoadingSpinner } from "@/app/components/LoadingSpinner";
import { apiFetch } from "@/lib/api";

type Lead = {
  product_id: string;
  item_name: string;
  pickup_location: { label: string };
  distance_km: number;
  price: number;
  seller: { name: string };
};

export default function HelperPage() {
  const { user, session, loading } = useAuth();
  const [profile, setProfile] = useState<{
    helper_id: string;
    is_new: boolean;
    location?: { label: string };
    vehicle_type?: string;
    lift_capacity_kg?: number;
  } | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [form, setForm] = useState({
    locationLabel: "",
    vehicle_type: "car",
    lift_capacity_kg: "20",
    default_quoted_fee: "5",
  });
  const [saving, setSaving] = useState(false);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    if (!user || !session?.access_token) return;
    setProfileError("");
    apiFetch(`/helper/profile/${user.id}`, { token: session.access_token })
      .then((r) => {
        if (r.status === 503) {
          setProfileError("Couldn't reach the server. Make sure the backend is running (e.g. uvicorn on port 8001).");
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((data) => {
        if (data) {
          setProfile({
            helper_id: data.helper_id,
            is_new: false,
            location: data.location,
            vehicle_type: data.vehicle_type,
            lift_capacity_kg: data.lift_capacity_kg,
          });
          setForm({
            locationLabel: data.location?.label ?? "",
            vehicle_type: data.vehicle_type ?? "car",
            lift_capacity_kg: String(data.lift_capacity_kg ?? 20),
            default_quoted_fee: String(data.default_quoted_fee ?? 5),
          });
        } else {
          setProfile({ helper_id: "", is_new: true });
        }
      })
      .catch(() => setProfileError("Couldn't load profile."));
  }, [user, session?.access_token]);

  useEffect(() => {
    if (!profile?.helper_id || !session?.access_token) return;
    setLoadingLeads(true);
    apiFetch(`/helper/leads?helper_id=${profile.helper_id}&radius_km=50`, {
      token: session.access_token,
    })
      .then((r) => r.json())
      .then((d) => {
        setLeads(d.leads ?? []);
      })
      .finally(() => setLoadingLeads(false));
  }, [profile?.helper_id, profile?.location?.lat, profile?.location?.lng, session?.access_token]);

  const saveProfile = async () => {
    if (!session?.access_token || !user) return;
    setLocationError("");
    const locationInput = form.locationLabel.trim() || "Madison, WI";
    setSaving(true);
    const geoRes = await apiFetch(
      `/helper/geocode?address=${encodeURIComponent(locationInput)}`,
      { token: session.access_token }
    );
    if (!geoRes.ok) {
      setSaving(false);
      const errBody = await geoRes.json().catch(() => ({}));
      const msg = errBody.detail ?? "Could not find that location. Try a city name (e.g. Chicago, Madison) or full address.";
      setLocationError(Array.isArray(msg) ? msg[0] : msg);
      return;
    }
    const geo = await geoRes.json();
    const location = { lat: geo.lat, lng: geo.lng, label: geo.label || locationInput };
    const res = await apiFetch("/helper/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: user.id,
        location,
        vehicle_type: form.vehicle_type,
        lift_capacity_kg: parseFloat(form.lift_capacity_kg) || 20,
        default_quoted_fee: parseFloat(form.default_quoted_fee) || 0,
      }),
      token: session.access_token,
    });
    setSaving(false);
    if (res.ok) {
      const data = await res.json();
      setProfile({ ...profile!, helper_id: data.helper_id, is_new: data.is_new, location });
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!user) {
    return (
      <div className="p-8">
        <p className="text-stone-600">Log in to use Helper Mode.</p>
        <Link href="/login" className="mt-4 inline-block text-amber-600 hover:underline">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-xl font-bold text-stone-800">Helper mode</h1>
      {profileError && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
          {profileError}
        </p>
      )}
      <p className="mt-1 text-sm text-stone-500">
        Set your location and capacity. We&apos;ll show you nearby listings you can help deliver.
      </p>

      <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6">
        {profile?.is_new ? (
          <p className="text-stone-600">Enter your helper details to get started.</p>
        ) : (
          <p className="text-stone-600">
            Welcome back! Using your {profile?.vehicle_type} in {profile?.location?.label}. Edit below if needed.
          </p>
        )}
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700">Location (e.g. building or area)</label>
            <input
              value={form.locationLabel}
              onChange={(e) => setForm((s) => ({ ...s, locationLabel: e.target.value }))}
              placeholder="e.g. Sellery Hall"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700">Vehicle type</label>
            <select
              value={form.vehicle_type}
              onChange={(e) => setForm((s) => ({ ...s, vehicle_type: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            >
              <option value="car">Car</option>
              <option value="bike">Bike</option>
              <option value="on foot">On foot</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700">Lift capacity (kg)</label>
            <input
              type="number"
              value={form.lift_capacity_kg}
              onChange={(e) => setForm((s) => ({ ...s, lift_capacity_kg: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700">Default delivery fee ($)</label>
            <input
              type="number"
              value={form.default_quoted_fee}
              onChange={(e) => setForm((s) => ({ ...s, default_quoted_fee: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            />
          </div>
        </div>
        {locationError && (
          <p className="mt-2 text-sm text-red-600">{locationError}</p>
        )}
        <button
          type="button"
          onClick={saveProfile}
          disabled={saving}
          className="mt-4 rounded-lg bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : profile?.is_new ? "Save & get leads" : "Update details"}
        </button>
      </div>

      {profile?.helper_id && (
        <section className="mt-8">
          <h2 className="font-semibold text-stone-800">Delivery leads near you</h2>
          {loadingLeads ? (
            <LoadingSpinner fullPage={false} className="mt-4" />
          ) : leads.length === 0 ? (
            <p className="mt-2 text-sm text-stone-500">No nearby listings right now.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {leads.map((l) => (
                <li
                  key={l.product_id}
                  className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-stone-800">{l.item_name}</p>
                    <p className="text-sm text-stone-500">
                      {l.pickup_location?.label} · {l.distance_km.toFixed(1)} km · ${l.price}
                    </p>
                  </div>
                  <Link
                    href={`/products/${l.product_id}`}
                    className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
                  >
                    Volunteer to deliver
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Link href="/" className="mt-8 inline-block text-sm text-stone-500 hover:underline">
        ← Back to buyer/seller
      </Link>
    </div>
  );
}
