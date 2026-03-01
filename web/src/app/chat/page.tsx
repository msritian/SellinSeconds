"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/providers";
import { apiFetch } from "@/lib/api";

type ChatItem = {
  chat_id: string;
  product: { product_id: string; item_name: string; price: number; status: string };
  my_role: string;
  other_party: { user_id: string; name: string; role: string }[];
  last_message: { sender_id: string; content: string; sent_at: string } | null;
  unread_count: number;
};

export default function ChatListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, session, loading } = useAuth();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingChats, setLoadingChats] = useState(true);
  const acceptHelperHandled = useRef(false);

  useEffect(() => {
    if (!session?.access_token) {
      setLoadingChats(false);
      return;
    }
    setLoadingChats(true);
    setLoadError(null);
    apiFetch("/chat", { token: session.access_token })
      .then((r) => r.json())
      .then((d) => setChats(d.chats ?? []))
      .catch((err) => setLoadError(err?.message ?? "Failed to load chats"))
      .finally(() => setLoadingChats(false));
  }, [session?.access_token]);

  useEffect(() => {
    const acceptHelper = searchParams.get("accept_helper");
    const helperId = searchParams.get("helper_id");
    const productId = searchParams.get("product_id");
    if (!user?.id || !session?.access_token || !acceptHelper || !helperId || !productId || acceptHelperHandled.current) return;
    acceptHelperHandled.current = true;
    (async () => {
      try {
        const productRes = await apiFetch(`/products/${productId}`, { token: session.access_token });
        if (!productRes.ok) return;
        const productData = await productRes.json();
        const sellerId = productData.seller?.user_id;
        if (!sellerId) return;
        const initiateRes = await apiFetch("/chat/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: productId, buyer_id: user.id, seller_id: sellerId }),
          token: session.access_token,
        });
        if (!initiateRes.ok) return;
        const { chat_id } = await initiateRes.json();
        const acceptRes = await apiFetch("/helper/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id, helper_id: helperId, product_id: productId, buyer_id: user.id }),
          token: session.access_token,
        });
        if (acceptRes.ok && chat_id) {
          router.replace(`/chat/${chat_id}`);
        }
      } catch {
        // ignore
      }
    })();
  }, [user?.id, session?.access_token, searchParams, router]);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-stone-500">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 text-center">
        <p className="text-stone-600">Log in to see your chats.</p>
        <Link href="/login" className="mt-4 inline-block text-amber-600 hover:underline">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-xl font-semibold text-stone-800">Your chats</h1>
      <p className="mt-1 text-sm text-stone-500">
        As buyer or seller — open a chat to see messages and the product.
      </p>

      {loadError && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {loadError}
        </div>
      )}

      {loadingChats ? (
        <div className="mt-8 flex flex-col items-center justify-center gap-3 py-12">
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-stone-200 border-t-amber-600"
            aria-hidden
          />
          <p className="text-sm text-stone-500">Loading chats…</p>
        </div>
      ) : (
      <ul className="mt-6 space-y-2">
        {chats.length === 0 && !loadError && (
          <li className="rounded-xl border border-stone-200 bg-white px-4 py-8 text-center text-stone-500">
            No chats yet. Start by opening a product and clicking &ldquo;I&rsquo;m interested&rdquo; or &ldquo;Message seller&rdquo;.
          </li>
        )}
        {chats.map((chat) => {
          const other = chat.other_party[0];
          const otherLabel = other ? `${other.name} (${other.role})` : "—";
          const productLink = `/products/${chat.product.product_id}`;
          const hasUnread = chat.unread_count > 0;
          return (
            <li key={chat.chat_id}>
              <Link
                href={`/chat/${chat.chat_id}`}
                className={`block rounded-xl border px-4 py-3 transition hover:bg-stone-50 ${
                  hasUnread ? "border-amber-300 bg-amber-50/50" : "border-stone-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-stone-800">{chat.product.item_name}</span>
                      {hasUnread && (
                        <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-medium text-white">
                          {chat.unread_count} new
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-stone-500">
                      With {otherLabel} · You as <span className="capitalize">{chat.my_role}</span>
                    </p>
                    {chat.last_message && (
                      <p className="mt-1 truncate text-sm text-stone-600">
                        {chat.last_message.content || "—"}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-stone-400">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          router.push(productLink);
                        }}
                        className="text-amber-600 hover:underline"
                      >
                        View product →
                      </button>
                      {" · "}
                      ${chat.product.price.toFixed(2)}
                      {chat.product.status !== "available" && ` · ${chat.product.status}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-stone-400">
                    {chat.last_message?.sent_at
                      ? new Date(chat.last_message.sent_at).toLocaleDateString()
                      : ""}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      )}
    </div>
  );
}
