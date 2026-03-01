# SellinSeconds

Campus marketplace for students: **buy**, **sell**, or **help deliver** items. AI-powered search and listing extraction; proximity-based matching via Google Maps; real-time chat and escrow-style payment flow.

---

## Features

- **Buyers:** AI conversational search by intent + location, browse products by proximity, message sellers, optionally add a helper for delivery, chat in 2- or 3-way threads, finalize deal (buyer + seller both confirm), release payment (escrow-style).
- **Sellers:** Create listings with media and description; AI extracts title, price, location; review/edit and publish. Manage **My listings** (available and closed/sold).
- **Helpers:** Toggle Helper Mode, set location/vehicle/capacity/fee, see nearby **leads** (available products), express interest; buyers can **Accept helper** to add you to the chat for delivery coordination.

Auth is restricted to **@wisc.edu** emails. All API calls (except register) require a valid session token.

---

## Architecture

| Layer | Tech | Role |
|-------|------|------|
| **Frontend** | Next.js 15 (App Router), React 19, TypeScript, Tailwind 4 | Auth via Supabase client; HTTP API and WebSocket to Python backend |
| **Backend** | Python 3.10, FastAPI | Auth (JWT validation), business logic, Supabase (Postgres + Storage), Google Maps, Anthropic |
| **Data** | Supabase | Auth, Postgres (users, products, chats, messages, helpers, payment state), Storage (listing media) |

When `NEXT_PUBLIC_API_URL` is set (e.g. `http://localhost:8001`), the frontend sends all API and WebSocket traffic to the Python backend. See **PROJECT_GUIDE.md** for full architecture and workflows.

---

## Prerequisites

- **Node.js** 18+ (LTS recommended) — [nodejs.org](https://nodejs.org) or `brew install node`
- **Python** 3.10 — `brew install python@3.10` (macOS) or [python.org](https://www.python.org/downloads/)
- **Supabase** account — [supabase.com](https://supabase.com)
- **Google Cloud** — for Geocoding API and Distance Matrix API (optional but recommended for search and helper location)
- **Anthropic** API key — for listing extraction and conversational buyer search (optional; fallback extraction without it)

---

## Setup (one-time)

### 1. Clone and install dependencies

```bash
git clone https://github.com/msritian/SellinSeconds.git
cd SellinSeconds
```

**Frontend:**

```bash
cd web
npm install
cd ..
```

**Backend:**

```bash
cd backend
python3.10 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

### 2. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run the migrations in order:
   - `web/supabase/migrations/20250228000001_initial_schema.sql`
   - `web/supabase/migrations/20250301000001_chat_last_read.sql`
   - `web/supabase/migrations/20250301100000_product_accepted_helpers.sql`
3. In **Storage**, create a bucket named **`listings`** (public if you want direct image URLs for listing media).
4. In **Settings → API**, copy:
   - **Project URL**
   - **anon (public) key**
   - **service_role key** (keep secret; used by backend)

### 3. Environment variables

**Frontend (`web/.env`):**

```bash
cd web
cp .env.example .env
```

Edit `web/.env` and set:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service_role key (for API routes if used without backend) |
| `GOOGLE_MAPS_API_KEY` | No | Geocoding + Distance Matrix (for proximity search and helper location) |
| `NEXT_PUBLIC_API_URL` | For full app | Backend URL, e.g. `http://localhost:8001` (omit to use Next.js API routes only) |
| `NEXT_PUBLIC_APP_URL` | No | Base URL for server-side calls (default `http://localhost:3000`) |

**Backend (`backend/.env`):**

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and set:

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Same as NEXT_PUBLIC_SUPABASE_URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Same service_role key |
| `GOOGLE_MAPS_API_KEY` | No | For match_products distance and helper geocode |
| `ANTHROPIC_API_KEY` | No | For listing extraction and conversational search (fallback if missing) |
| `ANTHROPIC_MODEL` | No | Override model (default `claude-sonnet-4-6`) |
| `APP_URL` | No | Frontend URL (default `http://localhost:3000`) |

### 4. Run the app

**Terminal 1 — Backend:**

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload --port 8001
```

**Terminal 2 — Frontend:**

```bash
cd web
npm run dev
```

- Frontend: [http://localhost:3001](http://localhost:3001) (Next.js dev server uses port 3001)
- Backend API: [http://localhost:8001](http://localhost:8001) — docs at [http://localhost:8001/docs](http://localhost:8001/docs)

Register with an **@wisc.edu** email. If you don’t have one, you can temporarily adjust the check in `backend/app/auth.py` for local testing.

---

## Scripts

| Command | Where | Description |
|---------|--------|-------------|
| `npm run dev` | `web/` | Next.js dev server (Turbopack) on port 3001 |
| `npm run build` | `web/` | Production build |
| `npm run start` | `web/` | Run production Next.js server |
| `npm run lint` | `web/` | ESLint |
| `uvicorn main:app --reload --port 8001` | `backend/` | Run FastAPI backend |

---

## Project structure

```
SellinSeconds/
├── backend/                 # FastAPI (Python 3.10)
│   ├── main.py              # App, CORS, routers
│   ├── app/
│   │   ├── config.py        # Settings from env
│   │   ├── auth.py          # JWT validation (Supabase Auth)
│   │   ├── supabase_client.py
│   │   ├── routers/         # auth, user, seller, products, helper, chat, payment
│   │   ├── services.py      # match_products
│   │   ├── google_maps.py   # Geocoding, Distance Matrix
│   │   └── llm.py           # Anthropic: extract listing, conversational search
│   ├── Dockerfile
│   └── requirements.txt
├── web/                     # Next.js 15 App Router
│   ├── src/app/
│   │   ├── page.tsx, layout.tsx
│   │   ├── login/, register/, products/[id]/, chat/, chat/[id]/
│   │   ├── seller/listings/, helper/, list/
│   │   ├── api/v1/          # Next.js API routes (mirror backend when no Python)
│   │   ├── components/     # Nav, PaymentGatewayFlow, etc.
│   │   └── providers.tsx   # Auth (Supabase session)
│   ├── src/lib/             # api.ts, supabase, auth, helper-mode
│   ├── supabase/migrations/
│   ├── Dockerfile
│   └── package.json
├── scripts/
│   └── deploy-cloudrun.sh  # Build and deploy to Google Cloud Run
├── README.md               # This file
├── DEPLOY.md               # Cloud Run deployment details
└── PROJECT_GUIDE.md        # In-depth architecture and workflows
```

---

## Stack

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Backend:** FastAPI, Python 3.10, Uvicorn
- **Auth & data:** Supabase (Auth, Postgres, Storage)
- **APIs:** Google Maps (Geocoding, Distance Matrix), Anthropic (Claude for extraction and search)

---

## API overview

Base path: **`/api/v1`**. All endpoints except `POST /user/register` require header:

`Authorization: Bearer <access_token>`

| Area | Examples |
|------|----------|
| Auth | `POST /auth/login` |
| User | `POST /user/register` |
| Seller | `POST /seller/upload_listing`, `POST /seller/confirm_listing` |
| Products | `GET /products/by-seller/:id`, `GET /products/:id`, `GET /match_products`, `PATCH /products/:id/status` |
| Helper | `GET /helper/geocode`, `POST /helper/profile`, `GET /helper/leads`, `POST /helper/accept` |
| Chat | `GET /chat`, `POST /chat/initiate`, `GET /chat/:id`, `POST /chat/:id/message`, `GET /chat/:id/messages`, **WebSocket** `/chat/ws?chat_id=...&token=...` |
| Payment | `POST /payment/finalize_intent`, `POST /payment/hold`, `POST /payment/release` |

Interactive docs when backend is running: [http://localhost:8001/docs](http://localhost:8001/docs).

---

## Deployment (Google Cloud Run)

For a public demo, the app can be deployed to Cloud Run (backend + frontend as separate services). Full steps, env vars, and CORS setup are in **DEPLOY.md**.

Quick version:

```bash
export GCP_PROJECT=your-project-id
export GCP_REGION=us-central1
# Optional: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_MAPS_API_KEY
./scripts/deploy-cloudrun.sh
```

Then set backend **CORS_ORIGINS** to your frontend URL (see DEPLOY.md).

---

## Docs

- **README.md** (this file) — setup and overview
- **DEPLOY.md** — Google Cloud Run build, push, deploy, and env vars
- **PROJECT_GUIDE.md** — architecture, data model, auth, all workflows, and design choices in depth
