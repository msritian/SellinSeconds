# SellinSeconds

Campus marketplace for students: **buy**, **sell**, or **help deliver** items. AI-powered search and listing extraction; proximity-based matching via Google Maps; escrow-style payment flow.

---

## Setup (one-time)

### 1. Install Node.js (18+)

- **macOS (Homebrew):**  
  ```bash
  sudo chown -R $(whoami) /opt/homebrew /Users/$(whoami)/Library/Logs/Homebrew
  brew install node
  ```
- **Or:** [nodejs.org](https://nodejs.org) (LTS).

### 2. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run the migration:  
   `web/supabase/migrations/20250228000001_initial_schema.sql`
3. In **Storage**, create a bucket named **`listings`** (public if you want direct image URLs).
4. Copy **Project URL**, **anon key**, and **service_role key** from Settings → API.

### 3. Environment variables

In `web/`:

```bash
cp .env.example .env
```

Edit `web/.env` and set:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_MAPS_API_KEY` (enable Geocoding API + Distance Matrix API in Google Cloud)
- In `backend/.env`: `ANTHROPIC_API_KEY` (for listing extraction and buyer search)

### 4. Install and run

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Register with an **@wisc.edu** email.

---

## Scripts (from `web/`)

| Command        | Description                |
|----------------|----------------------------|
| `npm run dev`  | Dev server (Turbopack)     |
| `npm run build`| Production build           |
| `npm run start`| Run production server      |
| `npm run lint` | ESLint                     |

---

## Stack

- **Next.js 15** (App Router), **TypeScript**, **Tailwind CSS 4**
- **Backend**: **Python (FastAPI)** in `backend/` – same API spec at `/api/v1`
- **Supabase**: Auth (@wisc.edu), Postgres, Storage (listings)
- **Google Maps**: Geocoding, Distance Matrix (proximity)
- **Anthropic (Claude)**: Listing extraction, conversational buyer search

### Using the Python backend

1. In `backend/`: create `.env` from `.env.example`, install deps, run:
   ```bash
   python -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn main:app --reload --port 8001
   ```
2. In `web/.env` set:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:8001
   ```
3. Run the frontend (`cd web && npm run dev`). All API requests go to the Python backend.

---

## Product overview

- **Buyer:** Chat with AI to search by intent + location; get product cards; open PDP → message seller → optional helper → chat and payment flow.
- **Seller:** List an item (media + description); AI extracts fields → review/edit → publish.
- **Helper:** Toggle Helper Mode → set location/vehicle/capacity → see leads → volunteer on a listing; buyer can accept helper → 3-way chat and delivery.

API base: `/api/v1` (see spec in project docs). All endpoints except `/user/register` require `Authorization: Bearer <session_token>`.
