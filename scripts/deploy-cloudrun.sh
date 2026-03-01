#!/usr/bin/env bash
# Build, push, and deploy SellinSeconds backend + frontend to Google Cloud Run.
# Prerequisites: gcloud CLI installed and logged in (gcloud auth login).
#
# 1) Set your GCP project and region:
#      export GCP_PROJECT=your-gcp-project-id
#      export GCP_REGION=us-central1
# 2) Optional: set Supabase and Google Maps for backend (or set in Cloud Run Console later):
#      export SUPABASE_URL=https://xxx.supabase.co
#      export SUPABASE_SERVICE_ROLE_KEY=your-key
#      export GOOGLE_MAPS_API_KEY=your-key
# 3) Run: ./scripts/deploy-cloudrun.sh
#
# First run: enable APIs and create Artifact Registry repo (script does this).

set -e

GCP_PROJECT="${GCP_PROJECT:-}"
GCP_REGION="${GCP_REGION:-us-central1}"
REPO_NAME="${REPO_NAME:-sellinseconds}"
BACKEND_SERVICE="${BACKEND_SERVICE:-sellinseconds-api}"
FRONTEND_SERVICE="${FRONTEND_SERVICE:-sellinseconds-web}"

if [[ -z "$GCP_PROJECT" ]]; then
  echo "Error: set GCP_PROJECT (e.g. export GCP_PROJECT=my-project-id)"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Configuring gcloud project ==="
gcloud config set project "$GCP_PROJECT"

echo "=== Enabling APIs ==="
gcloud services enable artifactregistry.googleapis.com run.googleapis.com cloudbuild.googleapis.com --quiet

echo "=== Creating Artifact Registry repository (if missing) ==="
gcloud artifacts repositories describe "$REPO_NAME" --location="$GCP_REGION" 2>/dev/null || \
  gcloud artifacts repositories create "$REPO_NAME" --repository-format=docker --location="$GCP_REGION" --quiet

IMAGE_BASE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${REPO_NAME}"

echo "=== Building and pushing backend image ==="
gcloud builds submit --tag "${IMAGE_BASE}/${BACKEND_SERVICE}:latest" "$ROOT/backend"

echo "=== Deploying backend to Cloud Run ==="
BACKEND_ENV=""
[[ -n "${SUPABASE_URL:-}" ]] && BACKEND_ENV="${BACKEND_ENV}SUPABASE_URL=${SUPABASE_URL},"
[[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]] && BACKEND_ENV="${BACKEND_ENV}SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY},"
[[ -n "${GOOGLE_MAPS_API_KEY:-}" ]] && BACKEND_ENV="${BACKEND_ENV}GOOGLE_MAPS_API_KEY=${GOOGLE_MAPS_API_KEY}"

if [[ -n "$BACKEND_ENV" ]]; then
  gcloud run deploy "$BACKEND_SERVICE" \
    --image "${IMAGE_BASE}/${BACKEND_SERVICE}:latest" \
    --region "$GCP_REGION" \
    --platform managed \
    --allow-unauthenticated \
    --port 8080 \
    --set-env-vars "${BACKEND_ENV%,}"
else
  gcloud run deploy "$BACKEND_SERVICE" \
    --image "${IMAGE_BASE}/${BACKEND_SERVICE}:latest" \
    --region "$GCP_REGION" \
    --platform managed \
    --allow-unauthenticated \
    --port 8080
fi

BACKEND_URL=$(gcloud run services describe "$BACKEND_SERVICE" --region "$GCP_REGION" --format='value(status.url)')
BACKEND_URL="${BACKEND_URL%/}"
echo "Backend URL: $BACKEND_URL"

echo "=== Building and pushing frontend image (Cloud Build) ==="
SUBST="_NEXT_PUBLIC_API_URL=${BACKEND_URL},_IMAGE=${IMAGE_BASE}/${FRONTEND_SERVICE}"
[[ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ]] && SUBST="${SUBST},_NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}"
[[ -n "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ]] && SUBST="${SUBST},_NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}"

gcloud builds submit "$ROOT/web" \
  --config "$ROOT/web/cloudbuild.yaml" \
  --substitutions "${SUBST}"

echo "=== Deploying frontend to Cloud Run ==="
gcloud run deploy "$FRONTEND_SERVICE" \
  --image "${IMAGE_BASE}/${FRONTEND_SERVICE}:latest" \
  --region "$GCP_REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080

FRONTEND_URL=$(gcloud run services describe "$FRONTEND_SERVICE" --region "$GCP_REGION" --format='value(status.url)')
echo ""
echo "=== Done ==="
echo "Frontend (demo): $FRONTEND_URL"
echo "Backend API:     $BACKEND_URL"
echo ""
echo "If the frontend cannot reach the backend (CORS), update env vars only (no rebuild):"
echo "  gcloud run deploy $BACKEND_SERVICE --region $GCP_REGION \\"
echo "    --image ${IMAGE_BASE}/${BACKEND_SERVICE}:latest \\"
echo "    --update-env-vars CORS_ORIGINS=$FRONTEND_URL"
echo ""
echo "To set Supabase/keys in backend later: Cloud Run Console → $BACKEND_SERVICE → Edit → Variables."