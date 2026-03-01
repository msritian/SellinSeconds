# Deploy to Google Cloud Run (demo)

Deploy the SellinSeconds backend (FastAPI) and frontend (Next.js) to Cloud Run with public URLs.

## Prerequisites

- [Google Cloud SDK (gcloud)](https://cloud.google.com/sdk/docs/install) installed and logged in: `gcloud auth login`
- A GCP project with billing enabled
- Backend image built with **Python 3.10** (see `backend/Dockerfile`); deploy via gcloud uses this runtime.

## One-command deploy

1. Set your project and optional env vars:

```bash
export GCP_PROJECT=your-gcp-project-id
export GCP_REGION=us-central1

# Optional: backend env (or set later in Cloud Run Console)
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
export GOOGLE_MAPS_API_KEY=your-google-maps-key

# Optional: frontend build (Supabase public keys; or use defaults from .env in build)
export NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

2. Run the deploy script:

```bash
chmod +x scripts/deploy-cloudrun.sh
./scripts/deploy-cloudrun.sh
```

3. The script will:

   - Enable Artifact Registry, Cloud Run, and Cloud Build APIs
   - Create a Docker repo in Artifact Registry (if needed)
   - Build and push the **backend** image, then deploy to Cloud Run
   - Build the **frontend** image with `NEXT_PUBLIC_API_URL` set to the backend URL, push, and deploy
   - Print the frontend and backend URLs

4. **CORS:** After the first deploy, update the backend so the frontend can call it. You **must** pass `--image` so Cloud Run only updates env vars and does not rebuild from source:

```bash
# Replace FRONTEND_URL with your frontend URL from the script output.
# Replace the --image value with your backend image (same as in deploy script output).
export GCP_PROJECT=your-project-id
export GCP_REGION=us-central1
gcloud run deploy sellinseconds-api --region $GCP_REGION \
  --image ${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/sellinseconds/sellinseconds-api:latest \
  --update-env-vars CORS_ORIGINS=https://sellinseconds-web-xxxxx.run.app
```

5. Open the **frontend URL** in a browser for the demo.

## Manual build / push / deploy

### Backend

```bash
export GCP_PROJECT=your-project
export GCP_REGION=us-central1
export REPO=sellinseconds

# Build and push
gcloud builds submit --tag ${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${REPO}/sellinseconds-api:latest backend/

# Deploy (set env vars in Console or via --set-env-vars)
gcloud run deploy sellinseconds-api \
  --image ${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${REPO}/sellinseconds-api:latest \
  --region $GCP_REGION --platform managed --allow-unauthenticated --port 8080
```

### Frontend

Build the image with your **backend** URL so the client can reach the API:

```bash
export BACKEND_URL=https://sellinseconds-api-xxxxx.run.app  # your backend URL

docker build -f web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=$BACKEND_URL \
  -t ${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${REPO}/sellinseconds-web:latest \
  web/
```

Then push and deploy:

```bash
gcloud auth configure-docker ${GCP_REGION}-docker.pkg.dev --quiet
docker push ${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${REPO}/sellinseconds-web:latest

gcloud run deploy sellinseconds-web \
  --image ${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${REPO}/sellinseconds-web:latest \
  --region $GCP_REGION --platform managed --allow-unauthenticated --port 8080
```

## Environment variables

### Backend (Cloud Run)

| Variable | Required | Description |
|---------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `GOOGLE_MAPS_API_KEY` | No | For distance/proximity |
| `CORS_ORIGINS` | Yes for demo | Frontend URL, e.g. `https://sellinseconds-web-xxx.run.app` |

Set them in Cloud Run: Console → your service → Edit → Variables.

### Frontend (build-time)

`NEXT_PUBLIC_API_URL` is set at **build time** in the Dockerfile/Cloud Build to your backend Cloud Run URL. Other `NEXT_PUBLIC_*` (Supabase URL, anon key) can be passed as build-args or use defaults from your `.env` when building locally.
