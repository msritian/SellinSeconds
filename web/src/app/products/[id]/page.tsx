"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/providers";
import { LoadingSpinner } from "@/app/components/LoadingSpinner";
import { apiFetch, getApiUrl } from "@/lib/api";
import { getStoredHelperMode } from "@/lib/helper-mode";

type Product = {
  product_id: string;
  seller: { user_id: string; name: string };
  item_name: string;
  description: string;
  price: number;
  status: string;
  location: { label: string };
  media_urls: Array<{ url: string; thumbnail_url?: string; media_type: string }>;
  helpers: Array<{
    helper_id: string;
    name: string;
    vehicle_type: string;
    lift_capacity_kg: number;
    proximity_km: number;
    quoted_fee: number;
  }>;
  helper_count: number;
};

export default function ProductPage() {
  const params = useParams();
  const router = useRouter();
  const { user, session, loading } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(true);
  const [error, setError] = useState("");
  const [helperModeOn, setHelperModeOn] = useState(false);
  const [myHelperId, setMyHelperId] = useState<string | null>(null);
  const [quotedFee, setQuotedFee] = useState("");
  const [volunteering, setVolunteering] = useState(false);

  const id = params.id as string;

  useEffect(() => {
    if (!id) {
      setLoadingProduct(false);
      return;
    }
    setLoadingProduct(true);
    setError("");
    fetch(getApiUrl(`/products/${id}`))
      .then((res) => {
        if (!res.ok) {
          setError("Product not found");
          setProduct(null);
          return;
        }
        return res.json();
      })
      .then((data) => {
        if (data) setProduct(data);
      })
      .catch(() => setError("Could not load product."))
      .finally(() => setLoadingProduct(false));
  }, [id]);

  useEffect(() => {
    if (!user?.id) return;
    setHelperModeOn(getStoredHelperMode(user.id));
  }, [user?.id]);

  useEffect(() => {
    if (!helperModeOn || !user?.id || !session?.access_token) return;
    apiFetch(`/helper/profile/${user.id}`, { token: session.access_token })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data?.helper_id != null && setMyHelperId(data.helper_id))
      .catch(() => {});
  }, [helperModeOn, user?.id, session?.access_token]);

  useEffect(() => {
    const onStorage = () => {
      if (user?.id) setHelperModeOn(getStoredHelperMode(user.id));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [user?.id]);

  if (loading) return <LoadingSpinner />;
  if (!user) {
    router.push("/login");
    return null;
  }
  if (loadingProduct) return <LoadingSpinner />;
  if (error || !product) {
    return (
      <div className="p-8">
        <p className="text-red-600">{error || "Not found"}</p>
        <div className="mt-4 flex flex-col gap-2">
          <Link href="/" className="text-amber-600 hover:underline">
            Back to search
          </Link>
          <Link href="/seller/listings" className="text-amber-600 hover:underline">
            Back to listings
          </Link>
        </div>
      </div>
    );
  }

  const handleMessageSeller = async () => {
    if (!session?.access_token) return;
    const res = await apiFetch("/chat/initiate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: product.product_id,
        buyer_id: user.id,
        seller_id: product.seller.user_id,
      }),
      token: session.access_token,
    });
    if (!res.ok) return;
    const data = await res.json();
    router.push(`/chat/${data.chat_id}`);
  };

  const handleVolunteer = async () => {
    if (!session?.access_token || !product) return;
    setVolunteering(true);
    const res = await apiFetch(`/helper/profile/${user.id}`, {
      method: "GET",
      token: session.access_token,
    });
    let helperId: string;
    if (res.ok) {
      const profile = await res.json();
      helperId = profile.helper_id;
      setMyHelperId(helperId);
    } else {
      setError("Please complete your helper profile first (Helper Mode).");
      setVolunteering(false);
      return;
    }
    const fee = parseFloat(quotedFee) || 0;
    const r2 = await apiFetch("/helper/express_interest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        helper_id: helperId,
        product_id: product.product_id,
        quoted_fee: fee,
      }),
      token: session.access_token,
    });
    setVolunteering(false);
    if (r2.ok) {
      const updated = await fetch(getApiUrl(`/products/${id}`)).then((r) => r.json());
      setProduct(updated);
    }
  };

  const thumb = product.media_urls?.[0]?.thumbnail_url ?? product.media_urls?.[0]?.url;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-col gap-2 text-sm">
        <Link href="/" className="text-amber-600 hover:underline">
          ← Back to search
        </Link>
        <Link href="/seller/listings" className="text-amber-600 hover:underline">
          ← Back to listings
        </Link>
      </div>

      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div className="space-y-4">
          {product.media_urls?.length ? (
            <div className="overflow-hidden rounded-xl bg-stone-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumb ?? product.media_urls[0].url}
                alt={product.item_name}
                className="h-80 w-full object-contain"
              />
            </div>
          ) : (
            <div className="flex h-80 items-center justify-center rounded-xl bg-stone-200 text-stone-500">
              No image
            </div>
          )}
        </div>

        <div>
          <h1 className="text-2xl font-bold text-stone-800">{product.item_name}</h1>
          <p className="mt-2 text-2xl font-semibold text-amber-600">${product.price.toFixed(2)}</p>
          <p className="mt-2 text-stone-600">{product.description}</p>
          <p className="mt-2 text-sm text-stone-500">Location: {product.location?.label}</p>
          <p className="mt-1 text-sm text-stone-500">Seller: {product.seller.name}</p>
          <p className="mt-2 text-sm text-stone-500">Status: {product.status}</p>

          {product.status === "available" &&
            user.id !== product.seller.user_id &&
            !helperModeOn && (
              <button
                type="button"
                onClick={handleMessageSeller}
                className="mt-6 w-full rounded-lg bg-amber-600 py-2.5 font-medium text-white hover:bg-amber-700"
              >
                Message seller / I&apos;m interested
              </button>
            )}

          <section className="mt-8 border-t border-stone-200 pt-6">
            {(() => {
              const isSeller = user.id === product.seller.user_id;
              const isHelper = helperModeOn && !isSeller;
              const hasAlreadyVolunteered =
                myHelperId != null &&
                (product.helpers?.some((h) => h.helper_id === myHelperId) ?? false);
              const showAvailableHelpers = true;
              const showVolunteer = isHelper && !hasAlreadyVolunteered;
              const isBuyer = !isSeller && !helperModeOn;
              return (
                <>
                  {showAvailableHelpers && (
                    <>
                      <h2 className="font-semibold text-stone-800">Available helpers ({product.helper_count})</h2>
                      {product.helpers?.length ? (
                        <ul className="mt-2 space-y-2">
                          {product.helpers.map((h) => (
                            <li
                              key={h.helper_id}
                              className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-4 py-2"
                            >
                              <span>
                                {h.name} · {h.vehicle_type} · {h.proximity_km.toFixed(1)} km · ${h.quoted_fee.toFixed(2)} delivery
                              </span>
                              {isBuyer && h.helper_id !== myHelperId && (
                                <Link
                                  href={`/chat?accept_helper=1&helper_id=${h.helper_id}&product_id=${product.product_id}`}
                                  className="text-sm font-medium text-amber-600 hover:underline"
                                >
                                  Accept helper
                                </Link>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-stone-500">No helpers yet.</p>
                      )}
                    </>
                  )}
                  {showVolunteer && (
                    <div>
                      <p className="text-sm font-medium text-stone-700">Volunteer to deliver this item</p>
                      <input
                        type="number"
                        placeholder="Your delivery fee ($)"
                        value={quotedFee}
                        onChange={(e) => setQuotedFee(e.target.value)}
                        className="mt-1 w-32 rounded border border-stone-300 px-2 py-1 text-sm"
                      />
                      <button
                        type="button"
                        onClick={handleVolunteer}
                        disabled={volunteering}
                        className="ml-2 rounded-lg bg-stone-700 px-4 py-1.5 text-sm text-white hover:bg-stone-800 disabled:opacity-50"
                      >
                        {volunteering ? "…" : "Volunteer to deliver"}
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </section>
        </div>
      </div>
    </div>
  );
}
