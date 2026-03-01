# Campus Marketplace API (Python)

FastAPI backend implementing the Campus Marketplace API spec at `/api/v1`.

## Setup

1. **Python 3.11+** recommended.

2. **Create virtualenv and install dependencies:**
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate   # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Environment variables** (copy from `.env.example`):
   - `SUPABASE_URL` – Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` – Service role key (for auth admin and DB)
   - `GOOGLE_MAPS_API_KEY` – For Geocoding and Distance Matrix
   - `OPENAI_API_KEY` – For listing extraction and conversational search
   - `APP_URL` – Optional; used when calling back to app (e.g. for match_products from posts)

4. **Run the server:**
   ```bash
   uvicorn main:app --reload --port 8000
   ```
   API: http://localhost:8000  
   Docs: http://localhost:8000/docs

## Frontend

Point the Next.js app to this backend by setting in `web/.env`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```
Then run the frontend (`cd web && npm run dev`). All API calls will go to the Python backend.

## Endpoints

Same as the API spec: user (register), auth (login), seller (upload_listing, confirm_listing), products (get, match_products, posts, status), helper (profile, leads, express_interest, accept), chat (initiate, participants, message, messages), payment (finalize_intent, hold, release).
