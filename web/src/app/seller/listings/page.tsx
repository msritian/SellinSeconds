"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/providers";
import { LoadingSpinner } from "@/app/components/LoadingSpinner";
import { getApiUrl } from "@/lib/api";

type Listing = {
  product_id: string;
  item_name: string;
  description: string | null;
  price: number;
  status: string;
  location: { label?: string } | null;
  media_urls: Array<{ url: string; thumbnail_url?: string; media_type?: string }>;
  created_at: string;
};

export default function SellerListingsPage() {
  const { user, loading } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [closedListings, setClosedListings] = useState<Listing[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingClosed, setLoadingClosed] = useState(true);
  const [error, setError] = useState("");
  const [errorClosed, setErrorClosed] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    setLoadingList(true);
    setError("");
    fetch(getApiUrl(`/products/by-seller/${user.id}?status=available`))
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load listings");
        return res.json();
      })
      .then((data) => setListings(data.products ?? []))
      .catch(() => setError("Could not load your listings."))
      .finally(() => setLoadingList(false));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    setLoadingClosed(true);
    setErrorClosed("");
    fetch(getApiUrl(`/products/by-seller/${user.id}?status=sold`))
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load closed listings");
        return res.json();
      })
      .then((data) => setClosedListings(data.products ?? []))
      .catch(() => setErrorClosed("Could not load closed listings."))
      .finally(() => setLoadingClosed(false));
  }, [user?.id]);

  if (loading) return <LoadingSpinner />;
  if (!user) {
    return (
      <div className="p-8">
        <p className="text-stone-600">Please log in to view your listings.</p>
        <Link href="/login" className="mt-4 inline-block text-amber-600 hover:underline">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-stone-800">My available listings</h1>
      <p className="mt-1 text-sm text-stone-500">
        Items you are currently selling.
      </p>

      {loadingList ? (
        <LoadingSpinner fullPage={false} className="mt-8" />
      ) : error ? (
        <p className="mt-6 text-amber-700">{error}</p>
      ) : listings.length === 0 ? (
        <div className="mt-6 rounded-xl border border-stone-200 bg-stone-50 p-8 text-center">
          <p className="text-stone-600">You have no available listings yet.</p>
          <Link
            href="/list"
            className="mt-4 inline-block rounded-lg bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700"
          >
            List an item
          </Link>
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {listings.map((l) => {
            const thumb = l.media_urls?.[0];
            const imgUrl =
              typeof thumb === "string"
                ? thumb
                : thumb
                  ? (thumb as { thumbnail_url?: string; url?: string }).thumbnail_url ??
                    (thumb as { url?: string }).url ?? null
                  : null;
            return (
              <li key={l.product_id}>
                <Link
                  href={`/products/${l.product_id}`}
                  className="block overflow-hidden rounded-xl border border-stone-200 bg-white transition hover:border-amber-300 hover:shadow-md"
                >
                  <div className="aspect-[4/3] bg-stone-100">
                    {imgUrl ? (
                      <img
                        src={imgUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-stone-400">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="font-medium text-stone-800">{l.item_name}</p>
                    <p className="mt-0.5 text-lg font-semibold text-amber-600">
                      ${l.price.toFixed(2)}
                    </p>
                    {l.location?.label && (
                      <p className="mt-1 truncate text-xs text-stone-500">
                        {l.location.label}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* Closed listings */}
      <section className="mt-12 border-t border-stone-200 pt-10">
        <h2 className="text-xl font-bold text-stone-700">Closed listings</h2>
        <p className="mt-1 text-sm text-stone-500">
          Items you have sold. These no longer appear in search for buyers.
        </p>
        {loadingClosed ? (
          <LoadingSpinner fullPage={false} className="mt-6" />
        ) : errorClosed ? (
          <p className="mt-6 text-amber-700">{errorClosed}</p>
        ) : closedListings.length === 0 ? (
          <div className="mt-6 rounded-xl border border-stone-200 bg-stone-50 p-6 text-center">
            <p className="text-stone-500">You have no closed listings yet.</p>
          </div>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {closedListings.map((l) => {
              const thumb = l.media_urls?.[0];
              const imgUrl =
                typeof thumb === "string"
                  ? thumb
                  : thumb
                    ? (thumb as { thumbnail_url?: string; url?: string }).thumbnail_url ??
                      (thumb as { url?: string }).url ?? null
                    : null;
              return (
                <li key={l.product_id}>
                  <Link
                    href={`/products/${l.product_id}`}
                    className="block overflow-hidden rounded-xl border border-stone-200 bg-stone-50/50 transition hover:border-stone-300 hover:bg-stone-50/80"
                  >
                    <div className="relative aspect-[4/3] bg-stone-100">
                      {imgUrl ? (
                        <img
                          src={imgUrl}
                          alt=""
                          className="h-full w-full object-cover opacity-90"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-stone-400">
                          No image
                        </div>
                      )}
                      <span className="absolute right-2 top-2 rounded bg-stone-600 px-2 py-0.5 text-xs font-medium text-white">
                        Sold
                      </span>
                    </div>
                    <div className="p-3">
                      <p className="font-medium text-stone-700">{l.item_name}</p>
                      <p className="mt-0.5 text-lg font-semibold text-stone-500">
                        ${l.price.toFixed(2)}
                      </p>
                      {l.location?.label && (
                        <p className="mt-1 truncate text-xs text-stone-500">
                          {l.location.label}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="mt-8 flex gap-4">
        <Link href="/list" className="text-sm font-medium text-amber-600 hover:underline">
          List another item
        </Link>
        <Link href="/" className="text-sm text-stone-500 hover:underline">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
