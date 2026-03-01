# SellinSeconds – Add-ons & New Features (Reference)

Quick reference for features and add-ons added on top of the core app.

---

## Backend (FastAPI, `backend/`)

### Products
- **`GET /api/v1/products/by-seller/{seller_id}`**  
  List a seller’s products. Query: `status` (default `available`). Returns `{ products, total }`. Route is registered **before** `GET /products/{product_id}` so `/products/by-seller/...` is matched correctly.

### Auth
- **Invalid token handling**  
  `app/auth.py`: `get_current_user` validates JWT with Supabase `GET .../auth/v1/user`. On non-200 or missing user id → **401 "Invalid token"**.

---

## Frontend (Next.js, `web/`)

### Pages & routes
- **`/seller/listings`** (`app/seller/listings/page.tsx`)  
  “My available listings” for the current user. Fetches `GET /products/by-seller/{user.id}?status=available`. Card grid with image, title, price, link to product. Empty state + “List an item” CTA.
- **`/`** – Buyer search (AI conversational).
- **`/list`** – Seller: list an item (upload + LLM extract → publish).
- **`/helper`** – Helper: profile (location, vehicle, fee), “Delivery leads near you”, volunteer.
- **`/products/[id]`** – Product detail; message seller, helpers, volunteer.
- **`/chat`**, **`/chat/[id]`** – Chat list and conversation.

### Nav (`app/components/Nav.tsx`)
- **Chat** link with **unread count** badge (from `GET /api/v1/chat`).
- **List an Item**, **My listings**, **Helper Mode** toggle.
- **Helper mode**: when on, user is on `/helper`; turning off goes to `/`.
- *Optional (if re-applied):* When helper mode is on, hide “List an Item” and “My listings”, and make the **SellinSeconds** logo link to `/helper` instead of `/`.

### Product detail (`app/products/[id]/page.tsx`)
- **“Message seller / I’m interested”** (orange CTA) shown only for **buyers**: hidden when viewer is the seller (`user.id === product.seller.user_id`) or in **helper mode** (`helperModeOn`). So: buyer only.
- **Loading:** `loadingProduct` state; no “Not found” flash. Spinner while product (and auth) load.

### Loading & UX
- **`LoadingSpinner`** (`app/components/LoadingSpinner.tsx`)  
  Reusable: optional label, optional full-page layout. Used on: product page, seller listings, helper, chat, list, home, nav (header loading).
- **Spinner everywhere** API/auth loading uses this instead of raw “Loading…” or brief “Not found”.

### Auth & API
- **`lib/api.ts`**
  - **401 retry:** On 401, call `supabase.auth.refreshSession()`, then retry the request once with the new access token. Reduces “Invalid token” when token expired.
  - **`getApiUrl(path)`:** Handles `NEXT_PUBLIC_API_URL` with or without trailing `/api/v1` (avoids double prefix).
- **`app/providers.tsx`**  
  On initial load, if there’s a session, call `refreshSession()` and use that session so the first API calls use a valid token.

---

## Next.js API routes (when not using Python backend)

- **`GET /api/v1/products/by-seller/[seller_id]`**  
  Same contract as backend: list products by `seller_id`, optional `status` (default `available`). Used when `NEXT_PUBLIC_API_URL` is unset.

---

## How to run

- **Backend:** `cd backend && source .venv/bin/activate && uvicorn main:app --reload --port 8001`
- **Frontend:** `cd web && npm run dev` (e.g. http://localhost:3000)
- **Use Python backend:** In `web/.env`, set `NEXT_PUBLIC_API_URL=http://localhost:8001`

---

## Optional helper-mode nav behavior (if not on this branch)

1. When **helper mode is on**: hide **List an Item** and **My listings** in the nav.
2. When **helper mode is on**: **SellinSeconds** logo link should go to **`/helper`**; when off, to **`/`**.

These can be re-applied in `Nav.tsx` by conditioning the logo `href` and the visibility of the two links on `helperMode`.
