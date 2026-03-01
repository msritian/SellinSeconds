# SellinSeconds — Project Guide (In-Depth)

This document explains the **architecture**, **workflows**, **codebase layout**, and **design decisions** of the campus marketplace app. Nothing is skipped.

---

## 1. What the app does

**SellinSeconds** is a campus marketplace where users can:

- **Buy:** Search by intent + location (AI), browse products, message sellers, optionally add a helper for delivery, chat in 2- or 3-way threads, and go through an escrow-style “finalize deal” flow.
- **Sell:** Create listings (text + media), get AI-extracted fields (title, price, location), review/edit, publish. Manage “My listings” (available + closed).
- **Help:** Turn on “Helper mode,” set location/vehicle/capacity/fee, see “leads” (nearby available products), express interest; a buyer can “Accept helper” and the helper joins the buyer–seller chat for delivery coordination.

Auth is **Supabase Auth** restricted to **@wisc.edu** emails. Data lives in **Supabase (Postgres + Storage)**. The **Python FastAPI** backend implements all business logic and talks to Supabase; the **Next.js** frontend uses that backend when `NEXT_PUBLIC_API_URL` is set (local: `http://localhost:8001`, production: your Cloud Run API URL).

---

## 2. Architecture overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Browser (Next.js 15, React 19, Tailwind 4)                               │
│  - Auth: Supabase client (session, refresh)                               │
│  - API: fetch(backend /api/v1/...) with Bearer token                     │
│  - Chat: WebSocket to backend /api/v1/chat/ws                             │
└─────────────────────────────────────────────────────────────────────────┘
                    │                              │
                    │ HTTP/JSON                    │ WebSocket (ws/wss)
                    ▼                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Python Backend (FastAPI, port 8001 / Cloud Run 8080)                     │
│  - Auth: validate JWT via Supabase Auth API                               │
│  - Business logic: chat, products, helper, payment, seller                │
│  - DB: Supabase Postgres (service_role) + Storage                        │
│  - External: Google Maps (geocode, distance), Anthropic (LLM)            │
└─────────────────────────────────────────────────────────────────────────┘
                    │
                    │ Supabase client (service_role key)
                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Supabase                                                                 │
│  - Auth (users, @wisc.edu), JWT                                          │
│  - Postgres: users, products, chats, messages, helpers, payment state   │
│  - Storage: bucket "listings" (listing media)                            │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Why a separate Python backend?**  
  To centralize auth, Supabase access (with service_role for admin/RLS bypass), and integrations (Google Maps, Anthropic). Next.js can stay a thin client and optional BFF; when `NEXT_PUBLIC_API_URL` is set, all API and WebSocket traffic goes to Python.

- **Why Supabase?**  
  Auth + Postgres + Storage in one place, RLS for security, and a single JWT used by both the frontend (session) and the backend (validation).

- **Why Next.js API routes under `/api/v1/`?**  
  They mirror the backend so the app can run in a “frontend-only” mode (no Python) for simple demos or serverless; in normal and production use, the frontend is configured to call the Python backend instead.

---

## 3. Repository layout

```
SellinSeconds/
├── backend/                    # FastAPI app
│   ├── main.py                 # App entry, CORS, routers
│   ├── requirements.txt
│   ├── Dockerfile              # Python 3.10, uvicorn, PORT from env
│   ├── app/
│   │   ├── config.py           # Pydantic Settings (Supabase, Google, Anthropic)
│   │   ├── auth.py             # JWT validation (Supabase Auth API), is_wisc_email
│   │   ├── supabase_client.py  # Global client + per-request get_supabase()
│   │   ├── schemas.py          # Pydantic request bodies
│   │   ├── services.py         # match_products (used by products + LLM)
│   │   ├── google_maps.py      # Geocoding, Distance Matrix
│   │   ├── llm.py              # Anthropic: extract listing, normalize location, conversational search
│   │   └── routers/
│   │       ├── auth.py         # POST /auth/login
│   │       ├── user.py         # POST /user/register
│   │       ├── seller.py       # upload_listing, confirm_listing
│   │       ├── products.py     # by-seller, get product, match_products, patch status
│   │       ├── helper.py       # geocode, profile, leads, express_interest, accept
│   │       ├── chat.py         # list chats, initiate, get chat, messages, WebSocket
│   │       └── payment.py      # finalize_intent, hold, release
├── web/                        # Next.js 15 App Router
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx, page.tsx
│   │   │   ├── login/, register/
│   │   │   ├── products/[id]/  # Product detail (buyer: message, helper; seller: edit)
│   │   │   ├── chat/, chat/[id]/  # Chat list, chat room (WebSocket)
│   │   │   ├── seller/listings/   # My listings (available + closed)
│   │   │   ├── helper/            # Helper mode, profile, leads
│   │   │   ├── list/              # Seller: create listing
│   │   │   ├── api/v1/            # Next.js API routes (mirror backend when no Python)
│   │   │   ├── components/        # Nav, LoadingSpinner, PaymentGatewayFlow
│   │   │   └── providers.tsx      # AuthProvider (Supabase session)
│   │   └── lib/
│   │       ├── api.ts             # getApiUrl, getChatWebSocketUrl, apiFetch
│   │       ├── auth.ts
│   │       ├── supabase/client.ts, server.ts
│   │       ├── google-maps.ts     # Client-side distance (optional)
│   │       └── helper-mode.ts     # Local storage: helper mode on/off
│   ├── supabase/migrations/      # SQL schema and migrations
│   ├── Dockerfile, cloudbuild.yaml
│   └── next.config.ts            # output: "standalone" for Docker
├── scripts/
│   └── deploy-cloudrun.sh        # Build & deploy backend + frontend to Cloud Run
├── README.md, DEPLOY.md, PROJECT_GUIDE.md (this file)
```

---

## 4. Data model (Supabase / Postgres)

- **users** — Id = Supabase Auth UID. name, email, approximate_location (JSON: lat, lng, label). Created on register.
- **listing_drafts** — Seller flow: extracted JSON (item_name, description, price, location, media_urls), markdown_preview. Deleted when listing is confirmed.
- **products** — seller_id, item_name, description, price, status (`available` | `sold`), location (JSON), media_urls (JSON array). status set to `sold` when both buyer and seller finalize.
- **helper_profiles** — One per user (user_id unique). location, vehicle_type, lift_capacity_kg, default_quoted_fee. Used for “Helper mode” and leads.
- **product_helpers** — (product_id, helper_id) + quoted_fee. Helpers who expressed interest on a product; shown on PDP as “Available helpers.”
- **product_accepted_helpers** — (product_id, buyer_id, helper_id). When buyer accepts a helper **before** a buyer–seller chat exists, we store it here; when chat is created (initiate), we add the helper to the chat and delete these rows.
- **chats** — id, product_id. One chat per buyer–seller pair per product (idempotent on initiate).
- **chat_participants** — (chat_id, user_id, role: buyer | seller | helper), last_read_at for unread counts.
- **messages** — chat_id, sender_id, content, sent_at.
- **finalize_intents** — chat_id, product_id, buyer_id, seller_id, buyer_confirmed, seller_confirmed, amount, hold_triggered. When both confirm, we set hold_triggered and create a payment_hold; we also set product status to `sold`.
- **payment_holds** — buyer_id, product_id, chat_id, amount, status (`held` | `released`). “Escrow” record; buyer can release to complete the flow (seller/helper amounts derived from product_helpers.quoted_fee).

RLS is enabled on all tables; the backend uses the **service_role** key so it can act on behalf of any user while still enforcing checks in application code.

---

## 5. Auth flow

- **Register:** Frontend calls backend `POST /api/v1/user/register` with name, email, password, approximate_location. Backend uses `supabase.auth.admin.create_user` (service_role), then inserts into `users`. Email must be @wisc.edu.
- **Login:** Frontend calls `POST /api/v1/auth/login` with email/password. Backend uses `supabase.auth.sign_in_with_password` and returns access_token (and user_id, expires_at). Frontend can also use Supabase client directly; in both cases the session is stored by Supabase client and used for subsequent API calls.
- **API auth:** Backend expects `Authorization: Bearer <access_token>`. It calls Supabase `GET .../auth/v1/user` with that token (and service_role apikey) to validate and get user id/email. That’s implemented in `get_current_user` (dependency) and `get_user_from_token` (used for WebSocket).
- **WebSocket auth:** Client connects with query params `token=...&chat_id=...`. Backend uses `get_user_from_token` and verifies the user is in `chat_participants` for that chat.

---

## 6. Frontend–backend wiring

- **Base URL:** `web/src/lib/api.ts` defines `getBase()` from `process.env.NEXT_PUBLIC_API_URL`. If set (e.g. `http://localhost:8001` or Cloud Run URL), all `getApiUrl(path)` requests go to that host with path `/api/v1{path}`. If not set, requests go to same-origin `/api/v1/...` (Next.js API routes).
- **apiFetch(path, { token, ... })**: Adds `Authorization: Bearer token`, calls `fetch(getApiUrl(path), ...)`. On 401, refreshes Supabase session and retries once with the new token. On network error, returns a 503 Response so callers get a consistent type.
- **WebSocket:** `getChatWebSocketUrl(chatId, token)` builds `wss://<backend-host>/api/v1/chat/ws?chat_id=...&token=...` so the chat room connects to the Python backend, which holds the in-memory `_chat_rooms` and broadcasts messages and finalize updates.

---

## 7. Main workflows

### 7.1 Seller: create listing

1. Seller goes to `/list`, uploads media and description.
2. Frontend calls backend `POST /api/v1/seller/upload_listing` (FormData: description, location, user_id, files). Backend uploads files to Supabase Storage bucket `listings`, then calls `extract_listing_from_text(description, default_location)` in `llm.py` (Anthropic) to get item_name, description, price, location. Saves a row in `listing_drafts` and returns draft_id + extracted fields.
3. Seller reviews/edits, then submits. Frontend calls `POST /api/v1/seller/confirm_listing` with draft_id and final fields. Backend inserts into `products` (status `available`), deletes the draft.

### 7.2 Buyer: search and open product

- **AI search:** `/posts` (or frontend conversational UI) calls backend `GET /api/v1/posts?query=...`. Backend uses `conversational_search` in `llm.py`: LLM parses query into lat, lng, item_name, max_price, radius_km and calls `match_products`. Results are returned as HTML or data; frontend can use `GET /api/v1/match_products?lat=...&lng=...&item_name=...` directly too.
- **match_products** (in `services.py`): Selects products by status (default `available`), optional item_name filter and max_price; uses Google Distance Matrix to compute distances from (lat, lng); filters by radius_km and returns sorted list.
- Product detail page `GET /api/v1/products/{id}` loads product, seller, and `product_helpers` (with helper_profiles and distances) as “Available helpers.”

### 7.3 Buyer: message seller and optional helper

1. On PDP, buyer clicks “Message seller” (or “I’m interested”). Frontend calls `POST /api/v1/chat/initiate` with product_id, buyer_id, seller_id. Backend finds or creates a chat for that product+buyer+seller, adds buyer and seller to `chat_participants`. If there are rows in `product_accepted_helpers` for this product+buyer, it adds those helpers to the same chat and deletes the rows. Returns chat_id.
2. Frontend redirects to `/chat/{chat_id}`. Chat page loads `GET /api/v1/chat/{chat_id}` (participants, product, finalize state) and `GET /api/v1/chat/{chat_id}/messages`, then opens a WebSocket to `wss://.../api/v1/chat/ws?chat_id=...&token=...`.
3. Messages are sent either via WebSocket (JSON `{ type: "message", content: "..." }`) or via `POST /api/v1/chat/{chat_id}/message`. Backend saves to `messages` and broadcasts to all WebSockets in `_chat_rooms[chat_id]`. Sender names come from `users` (participants); buyer/seller/helper roles from `chat_participants`.

### 7.4 Helper: accept flow

- **Express interest:** Helper on PDP clicks “Express interest” with a quoted_fee. Frontend calls `POST /api/v1/helper/express_interest` (or similar). Backend upserts `product_helpers` (product_id, helper_id, quoted_fee). That makes the helper appear under “Available helpers” for that product.
- **Accept helper (buyer only):** Buyer sees “Accept helper” only when not in helper mode and there are available helpers. On accept, if a buyer–seller chat already exists, backend adds the helper to that chat. If not, backend stores (product_id, buyer_id, helper_id) in `product_accepted_helpers`; when the buyer later initiates chat (step 7.3), the helper is added then.
- Helper does **not** see “Finalize deal”; only buyer and seller do.

### 7.5 Finalize deal and payment (escrow-style)

1. In the chat room, buyer and seller each click “Finalize deal” (amount = product price; backend can add helper fee when creating the hold). Frontend calls `POST /api/v1/payment/finalize_intent` with chat_id, product_id, confirmed_by, role (buyer | seller), amount.
2. Backend creates or updates a row in `finalize_intents`. When **both** buyer_confirmed and seller_confirmed are true (computed from existing row + current request so the second click counts), it: sets hold_triggered, inserts into `payment_holds` (amount = product amount + helper fee if any), and sets product `status` to `sold`. So the listing disappears from search (match_products and listing UIs filter by status `available`).
3. WebSocket receives `finalize_update` (from frontend posting that state or backend broadcasting); UI shows “Deal finalized” and the payment gateway flow.
4. **Release:** Buyer clicks “Release” to complete. Frontend calls `POST /api/v1/payment/release` with hold_id. Backend marks the hold as `released` and returns how much goes to seller vs helper (for UI only; no real money movement).

---

## 8. Backend modules in detail

- **config.py** — Pydantic Settings from env: supabase_url, supabase_service_role_key, google_maps_api_key, anthropic_api_key, anthropic_model, app_url. Defaults for url/key are `""` so the app can start on Cloud Run before env is set; Supabase is then “unconfigured” until vars are set.
- **auth.py** — `get_current_user`: HTTPBearer, validate JWT with Supabase Auth API, return `{ id, email }`. `get_user_from_token`: same for WebSocket. `is_wisc_email`: used in register/login.
- **supabase_client.py** — Global `supabase` client (or `_UnconfiguredSupabase` proxy if not configured). `get_supabase()`: per-request dependency that creates a **new** client, yields it, and closes it in `finally` so the global client is never closed and heavy routes (e.g. list_my_chats) don’t share a single connection. PostgREST patched to use HTTP/1.1 to avoid connection-pool issues under load.
- **routers/auth.py** — Login with email/password, @wisc.edu check, returns access_token.
- **routers/user.py** — Register: create_user in Supabase Auth, insert into `users` with approximate_location; rollback auth if insert fails.
- **routers/seller.py** — upload_listing: store files in Storage, LLM extract, insert listing_drafts. confirm_listing: insert products, delete draft.
- **routers/products.py** — by-seller (with status filter), get product (with helpers and distances), match_products (delegates to services.match_products), PATCH status (seller can set sold manually if needed).
- **routers/helper.py** — geocode (LLM normalize + Google Geocoding), profile CRUD, leads (available products within radius_km of helper’s location), express_interest (product_helpers), accept (add helper to chat or to product_accepted_helpers).
- **routers/chat.py** — list_my_chats (batched queries, unread from last_read_at), mark read, initiate (idempotent, pulls in accepted helpers), get chat, add participant, send message, get messages, WebSocket (accept, validate user, broadcast messages and finalize_update).
- **routers/payment.py** — finalize_intent (both confirm → payment_holds + product sold), hold, release (buyer only, status → released).
- **services.py** — match_products: filter by status/item_name/price, Google Distance Matrix, filter by radius, sort by distance.
- **google_maps.py** — Geocoding and Distance Matrix APIs; resolve_location_with_fallbacks for helper location.
- **llm.py** — Anthropic: extract_listing_from_text, normalize_location_for_geocode, conversational_search (parse query → call match_products).

---

## 9. Frontend pages and roles

- **/** — Home (search / entry).
- **/login, /register** — Auth; register requires @wisc.edu and approximate_location (geocoded if needed).
- **/products/[id]** — Product detail: buyer sees “Message seller,” “Available helpers,” “Accept helper”; seller sees edit; everyone sees status (available/sold).
- **/chat** — Chat list (chats for current user, unread counts). Optional query params for “accept helper” redirect: accept_helper, helper_id, product_id → initiate then redirect to chat.
- **/chat/[id]** — Chat room: messages, participant names/roles, finalize-deal button (buyer/seller only), payment gateway flow (hold → release).
- **/seller/listings** — My listings: “Available” and “Closed” (sold) sections; by-seller with status=available and status=sold.
- **/helper** — Helper mode: set location (geocode), vehicle, capacity, fee; list leads (nearby available products); express interest from here or from PDP.
- **/list** — Seller: upload listing, AI extract, confirm and publish.

Nav and components (e.g. PaymentGatewayFlow) are role-aware (buyer/seller/helper) and conditionally show finalize, accept helper, etc.

---

## 10. Deployment (Cloud Run)

- **Backend:** Dockerfile uses Python 3.10, exposes PORT (8080). Cloud Run sets PORT and CORS_ORIGINS (frontend URL). Supabase (and optional Google Maps, Anthropic) env vars are set in the service so the app works.
- **Frontend:** Next.js standalone build; build-time args NEXT_PUBLIC_API_URL (backend URL), optional Supabase public keys. Served with `node server.js` on PORT 8080, HOSTNAME=0.0.0.0.
- **Deploy script:** `scripts/deploy-cloudrun.sh` enables APIs, creates Artifact Registry repo, builds and deploys backend, then builds frontend (with backend URL) and deploys frontend. CORS step: update backend with `--image ... --update-env-vars CORS_ORIGINS=<frontend URL>` so the browser can call the API.

See **DEPLOY.md** for exact commands and env vars.

---

## 11. Why these choices (short)

| Choice | Reason |
|--------|--------|
| FastAPI + Python | Clear API surface, easy Supabase/httpx/Anthropic integration, async support for WebSocket. |
| Next.js 15 App Router | Modern React, SSR/SSG options, API routes as fallback when backend is not used. |
| Supabase Auth + Postgres + Storage | One stack for auth, DB, and files; RLS; JWT for both frontend and backend. |
| Single backend for API + WebSocket | Chat stays real-time on one service; no need to sync state across a separate WebSocket server. |
| Per-request Supabase client (get_supabase) | Avoids “client has been closed” when many requests run; global client kept for routes that don’t use the dependency. |
| product_accepted_helpers table | Lets buyer accept a helper before a chat exists; when chat is created, helpers are attached in one place. |
| Mark product sold on both finalize | Ensures listing disappears from search only after both parties commit; single source of truth in DB. |
| CORS from env | Same backend serves localhost and production; production frontend URL added via CORS_ORIGINS. |

This is the full picture of the project: workflow, codebase, and architecture in depth.
