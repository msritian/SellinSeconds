"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/app/providers";
import { LoadingSpinner } from "@/app/components/LoadingSpinner";
import { apiFetch } from "@/lib/api";

type DraftResponse = {
  draft_id: string;
  markdown_preview: string;
  default_location: { lat: number; lng: number; label: string };
  extracted: {
    item_name: string;
    description: string;
    price: number;
    location: { lat: number; lng: number; label: string };
    media_urls: string[];
  };
};

export default function ListPage() {
  const { user, session, loading } = useAuth();
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [publishing, setPublishing] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (loading) return <LoadingSpinner />;
  if (!user) {
    return (
      <div className="p-8">
        <p className="text-stone-600">Please log in to list an item.</p>
        <Link href="/login" className="mt-4 inline-block text-amber-600 hover:underline">
          Log in
        </Link>
      </div>
    );
  }

  const handleUpload = async () => {
    if (!description.trim() || !session?.access_token) {
      setError("Please describe your item (e.g. 'Selling my IKEA desk for $40, pickup at Doty St').");
      return;
    }
    setError("");
    const formData = new FormData();
    formData.set("description", description);
    formData.set("user_id", user.id);
    if (draft?.default_location) {
      formData.set("location", JSON.stringify(draft.default_location));
    }
    files.forEach((f) => formData.append("files", f));

    const res = await apiFetch("/seller/upload_listing", {
      method: "POST",
      body: formData,
      token: session.access_token,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Upload failed");
      return;
    }
    const data: DraftResponse = await res.json();
    setDraft(data);
    setEdits({
      item_name: data.extracted.item_name,
      description: data.extracted.description,
      price: String(data.extracted.price),
      location: data.extracted.location.label,
    });
  };

  const handlePublish = async () => {
    if (!draft || !session?.access_token) return;
    setPublishing(true);
    setError("");
    const loc = draft.extracted.location;
    const res = await apiFetch("/seller/confirm_listing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draft_id: draft.draft_id,
        item_name: edits.item_name ?? draft.extracted.item_name,
        description: edits.description ?? draft.extracted.description,
        price: parseFloat(edits.price ?? "0") || draft.extracted.price,
        location: { ...loc, label: edits.location ?? loc.label },
        media_urls: draft.extracted.media_urls,
      }),
      token: session.access_token,
    });
    setPublishing(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Publish failed");
      return;
    }
    const data = await res.json();
    setPublishedId(data.product_id);
  };

  if (publishedId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-stone-800">Listing published</h1>
        <Link
          href={`/products/${publishedId}`}
          className="mt-4 inline-block text-amber-600 hover:underline"
        >
          View your listing →
        </Link>
        <Link href="/" className="mt-6 block text-stone-500 hover:underline">
          Back to home
        </Link>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8">
        <h1 className="text-xl font-bold text-stone-800">List an item</h1>
        <p className="mt-1 text-sm text-stone-500">
          Upload photos/videos and describe your item. The AI will extract details for you.
        </p>

        <div
          className="mt-6 rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 p-8 text-center"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          {files.length ? (
            <p className="text-stone-600">{files.length} file(s) selected</p>
          ) : (
            <p className="text-stone-500">Drag & drop or click to upload images/videos</p>
          )}
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium text-stone-700">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Selling my IKEA desk for $40, pickup at Doty St. Good condition."
            rows={4}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button
          type="button"
          onClick={handleUpload}
          className="mt-6 w-full rounded-lg bg-amber-600 py-2.5 font-medium text-white hover:bg-amber-700"
        >
          Extract details with AI
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-xl font-bold text-stone-800">Review your listing</h1>
      <p className="mt-1 text-sm text-stone-500">Edit any field below, then publish.</p>

      <div className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-stone-700">Item name</label>
          <input
            value={edits.item_name ?? ""}
            onChange={(e) => setEdits((s) => ({ ...s, item_name: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700">Description</label>
          <textarea
            value={edits.description ?? ""}
            onChange={(e) => setEdits((s) => ({ ...s, description: e.target.value }))}
            rows={3}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700">Price ($)</label>
          <input
            type="number"
            value={edits.price ?? ""}
            onChange={(e) => setEdits((s) => ({ ...s, price: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700">Location</label>
          <input
            value={edits.location ?? ""}
            onChange={(e) => setEdits((s) => ({ ...s, location: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
          />
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handlePublish}
        disabled={publishing}
        className="mt-6 w-full rounded-lg bg-amber-600 py-2.5 font-medium text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {publishing ? "Publishing…" : "Publish listing"}
      </button>
      <button
        type="button"
        onClick={() => setDraft(null)}
        className="mt-3 w-full rounded-lg border border-stone-300 py-2 text-stone-600 hover:bg-stone-50"
      >
        Back to edit
      </button>
    </div>
  );
}
