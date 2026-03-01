"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/providers";
import { LoadingSpinner } from "@/app/components/LoadingSpinner";
import { PaymentGatewayFlow, type PaymentHoldInfo } from "@/app/components/PaymentGatewayFlow";
import { apiFetch } from "@/lib/api";
import { useChatWebSocket, type Message } from "@/hooks/useChatWebSocket";

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const { user, session, loading } = useAuth();
  const chatId = params.id as string;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [product, setProduct] = useState<{ product_id: string; price: number; item_name: string } | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [participants, setParticipants] = useState<{ user_id: string; role: string; name: string }[]>([]);
  const [finalizeState, setFinalizeState] = useState<{
    buyer_confirmed: boolean;
    seller_confirmed: boolean;
    status: string;
    hold_triggered: boolean;
  } | null>(null);
  const [paymentHold, setPaymentHold] = useState<PaymentHoldInfo | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const appendMessage = useCallback((msg: Message) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  const handleFinalizeUpdate = useCallback(
    (state: { buyer_confirmed: boolean; seller_confirmed: boolean; hold_triggered: boolean; status: string }) => {
      setFinalizeState(state);
      if (state.hold_triggered && session?.access_token) {
        apiFetch(`/chat/${chatId}`, { token: session.access_token })
          .then((r) => r.json())
          .then((d) => {
            if (d.payment_hold) setPaymentHold(d.payment_hold);
          })
          .catch(() => {});
      }
    },
    [chatId, session?.access_token]
  );

  const { connected, sendMessage: wsSendMessage, sendFinalizeUpdate } = useChatWebSocket({
    chatId: chatId || null,
    token: session?.access_token ?? null,
    onMessage: appendMessage,
    onFinalizeUpdate: handleFinalizeUpdate,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!chatId || !session?.access_token) return;
    setLoadError(null);
    Promise.all([
      apiFetch(`/chat/${chatId}`, { token: session.access_token })
        .then((r) => r.json())
        .then((d) => {
          if (d.product) setProduct(d.product);
          if (d.my_role) setMyRole(d.my_role);
          if (d.finalize_state) setFinalizeState(d.finalize_state);
          if (d.payment_hold) setPaymentHold(d.payment_hold);
          if (Array.isArray(d.participants)) setParticipants(d.participants);
        }),
      apiFetch(`/chat/${chatId}/messages`, { token: session.access_token })
        .then((r) => r.json())
        .then((d) => setMessages(d.messages ?? [])),
    ])
      .then(() => {
        apiFetch(`/chat/${chatId}/read`, {
          method: "PATCH",
          token: session!.access_token,
        }).catch(() => {});
      })
      .catch((err) => {
        const message =
          err?.message?.includes("fetch") || err?.name === "TypeError"
            ? "Could not reach the server. Make sure the backend is running (e.g. on port 8001)."
            : err?.message ?? "Failed to load chat.";
        setLoadError(message);
      });
  }, [chatId, session?.access_token]);

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || !session?.access_token || !user) return;
    setInput("");
    setSending(true);
    if (connected) {
      wsSendMessage(content);
      setSending(false);
      return;
    }
    const res = await apiFetch(`/chat/${chatId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sender_id: user.id, content }),
      token: session.access_token,
    });
    setSending(false);
    if (res.ok) {
      const data = await res.json();
      appendMessage({
        id: data.message_id,
        sender_id: user.id,
        content,
        sent_at: data.sent_at,
      });
    }
  };

  const handleFinalize = async () => {
    if (!product || !session?.access_token) return;
    const res = await apiFetch("/payment/finalize_intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        product_id: product.product_id,
        confirmed_by: user!.id,
        role: myRole === "seller" ? "seller" : "buyer",
        amount: product.price,
      }),
      token: session.access_token,
    });
    if (res.ok) {
      const data = await res.json();
      const state = {
        buyer_confirmed: data.buyer_confirmed,
        seller_confirmed: data.seller_confirmed,
        status: data.status,
        hold_triggered: data.hold_triggered,
      };
      setFinalizeState(state);
      sendFinalizeUpdate(state);
      if (data.hold_triggered && session?.access_token) {
        apiFetch(`/chat/${chatId}`, { token: session.access_token })
          .then((r) => r.json())
          .then((d) => {
            if (d.payment_hold) setPaymentHold(d.payment_hold);
          })
          .catch(() => {});
      }
    }
  };

  const handleReleasePayment = async () => {
    if (!paymentHold || paymentHold.status !== "held" || !session?.access_token || !user) return;
    setReleasing(true);
    try {
      const res = await apiFetch("/payment/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hold_id: paymentHold.hold_id, confirmed_by: user.id }),
        token: session.access_token,
      });
      if (res.ok) {
        setPaymentHold((prev) => (prev ? { ...prev, status: "released" as const } : null));
      }
    } finally {
      setReleasing(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!user) return null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-4 py-6">
      <Link href="/chat" className="text-sm text-amber-600 hover:underline">
        ← Back
      </Link>

      <div className="mt-4 rounded-xl border border-stone-200 bg-white">
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2 text-sm text-stone-500">
          <span>
            Chat
            {product && (
              <span className="ml-2">
                · {product.item_name} · ${product.price.toFixed(2)}
              </span>
            )}
          </span>
          <span
            className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
              connected ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            {connected ? "Live" : "Reconnecting…"}
          </span>
        </div>

        {loadError && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {loadError}
          </div>
        )}

        {/* Deal & payment: show steps when user is buyer or seller */}
        {product && (myRole === "buyer" || myRole === "seller") && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm">
            <p className="font-medium text-amber-900">Deal &amp; payment</p>
            {!finalizeState ? (
              <p className="mt-1 text-amber-800">
                Step 1: You and the other party each click <strong>Finalize deal</strong> below to confirm. Step 2: Once
                both have confirmed, a payment hold appears and the <strong>buyer</strong> can release payment through
                the gateway.
              </p>
            ) : (
              <>
                <p className="mt-1 text-amber-800">
                  Buyer confirmed: {finalizeState.buyer_confirmed ? "Yes" : "No"} · Seller confirmed:{" "}
                  {finalizeState.seller_confirmed ? "Yes" : "No"}
                </p>
                {!finalizeState.hold_triggered && (
                  <p className="mt-1 text-amber-800">
                    {myRole === "buyer"
                      ? finalizeState.buyer_confirmed
                        ? "Waiting for seller to confirm. Then you can release payment."
                        : "Click Finalize deal (buyer) below."
                      : finalizeState.seller_confirmed
                        ? "Waiting for buyer to confirm. Then they can release payment."
                        : "Click Finalize deal (seller) below."}
                  </p>
                )}
              </>
            )}
            {finalizeState?.hold_triggered && paymentHold && (
              <div className="mt-3">
                <PaymentGatewayFlow
                  paymentHold={paymentHold}
                  participantNames={{
                    seller: participants.find((p) => p.role === "seller")?.name,
                    helper: participants.find((p) => p.role === "helper")?.name,
                  }}
                  isBuyer={myRole === "buyer"}
                  onRelease={handleReleasePayment}
                  releasing={releasing}
                />
              </div>
            )}
            {finalizeState?.hold_triggered && !paymentHold && (
              <p className="mt-2 font-medium text-amber-800">Payment hold active. Loading payment details…</p>
            )}
          </div>
        )}

        <div className="max-h-96 space-y-2 overflow-y-auto p-4">
          {messages.map((m) => {
            const senderName = participants.find((p) => p.user_id === m.sender_id)?.name ?? "Unknown";
            return (
              <div
                key={m.id}
                className={`rounded-lg px-3 py-2 ${
                  m.sender_id === user.id ? "ml-8 bg-amber-100" : "mr-8 bg-stone-100"
                }`}
              >
                <p className="text-xs font-medium text-stone-600">{senderName}</p>
                <p className="whitespace-pre-wrap text-sm">{m.content}</p>
                <p className="mt-1 text-xs text-stone-500">
                  {new Date(m.sent_at).toLocaleString()}
                </p>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-stone-200 p-4">
          {product &&
            (myRole === "buyer" || myRole === "seller") &&
            !finalizeState?.hold_triggered &&
            (myRole === "buyer" ? !finalizeState?.buyer_confirmed : !finalizeState?.seller_confirmed) && (
              <button
                type="button"
                onClick={handleFinalize}
                className="mb-3 w-full rounded-lg bg-amber-600 py-2 text-sm font-medium text-white hover:bg-amber-700"
              >
                Finalize deal ({myRole})
              </button>
            )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message…"
              className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
