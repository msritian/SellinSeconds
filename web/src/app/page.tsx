"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "./providers";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { apiFetch } from "@/lib/api";
import Link from "next/link";

type Message = { role: "user" | "assistant"; content: string; html?: string };

export default function HomePage() {
  const { user, session, loading } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loadingQuery, setLoadingQuery] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (loading) return <LoadingSpinner />;

  if (!user) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-stone-800">Campus Marketplace</h1>
        <p className="mt-2 text-stone-600">
          Log in with your @wisc.edu email to search for items, list items to sell, or help with delivery.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/login"
            className="rounded-lg bg-amber-600 px-6 py-2.5 font-medium text-white hover:bg-amber-700"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="rounded-lg border border-stone-300 px-6 py-2.5 font-medium text-stone-700 hover:bg-stone-50"
          >
            Sign up
          </Link>
        </div>
      </div>
    );
  }

  const sendQuery = async () => {
    const q = input.trim();
    if (!q || !session?.access_token) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setLoadingQuery(true);

    try {
      const res = await apiFetch(`/posts?query=${encodeURIComponent(q)}`, { token: session.access_token });
      const html = await res.text();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Here are matching listings:", html },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, the search failed. Try again." },
      ]);
    } finally {
      setLoadingQuery(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold text-stone-800">Find something to buy</h1>
      <p className="mt-1 text-sm text-stone-500">
        Describe what you need and where you are (e.g. &quot;I need a mini-fridge near Slichter Hall under $50&quot;).
      </p>

      <div className="mt-6 flex flex-col gap-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-xl px-4 py-3 ${
              m.role === "user" ? "ml-8 bg-amber-100 text-stone-900" : "mr-8 bg-stone-100 text-stone-800"
            }`}
          >
            {m.html ? (
              <div
                className="prose prose-sm max-w-none prose-img:rounded-lg"
                dangerouslySetInnerHTML={{ __html: m.html }}
              />
            ) : (
              <p className="whitespace-pre-wrap">{m.content}</p>
            )}
          </div>
        ))}
        {loadingQuery && (
          <div className="mr-8 rounded-xl bg-stone-100 px-4 py-3 text-stone-500">
            Searching listings…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendQuery();
        }}
        className="mt-6 flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. I need a TV near Sellery Hall under $200"
          className="flex-1 rounded-lg border border-stone-300 px-4 py-2.5 text-stone-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          disabled={loadingQuery}
        />
        <button
          type="submit"
          disabled={loadingQuery}
          className="rounded-lg bg-amber-600 px-5 py-2.5 font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          Search
        </button>
      </form>

      <style jsx global>{`
        .product-cards {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 1rem;
          margin-top: 0.5rem;
        }
        .product-card {
          border: 1px solid #e7e5e4;
          border-radius: 0.5rem;
          overflow: hidden;
          background: #fff;
        }
        .product-card-thumb {
          width: 100%;
          height: 120px;
          object-fit: cover;
        }
        .product-card-body {
          padding: 0.75rem;
          font-size: 0.875rem;
        }
        .product-card-link {
          display: inline-block;
          margin-top: 0.5rem;
          color: #b45309;
          font-weight: 500;
        }
        .product-card-link:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
