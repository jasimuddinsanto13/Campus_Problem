#!/usr/bin/env bash
# =============================================================================
# Deploy the Django backend to Google Cloud Run with Cloud SQL (PostgreSQL).
#
# Prerequisites:
#   1. Install the Google Cloud SDK: https://cloud.google.com/sdk/docs/install
#   2. Run: gcloud auth login
#   3. Run: gcloud config set project niter-contest
#   4. Create a Cloud SQL PostgreSQL instance (see step 0 below)
#
# Usage:
#   cd backend
#   bash deploy-cloudrun.sh
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration — edit these as needed
# ---------------------------------------------------------------------------
PROJECT_ID="niter-contest"
REGION="asia-south1"
SERVICE_NAME="campus-backend"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"
DATABASE_INSTANCE="campus-postgres"   # Cloud SQL PostgreSQL instance name
INSTANCE_CONNECTION_NAME="${PROJECT_ID}:${REGION}:${DATABASE_INSTANCE}"

echo "========================================="
echo " Deploying Django backend to Cloud Run"
echo " Project : ${PROJECT_ID}"
echo " Region  : ${REGION}"
echo " Service : ${SERVICE_NAME}"
echo " DB      : Cloud SQL PostgreSQL"
echo "========================================="

# ---------------------------------------------------------------------------
# 0. Create Cloud SQL PostgreSQL instance (first-time only, skip if exists)
# ---------------------------------------------------------------------------
echo ""
echo "[0/6] Checking Cloud SQL instance..."
if ! gcloud sql instances describe "${DATABASE_INSTANCE}" --project="${PROJECT_ID}" &>/dev/null; then
  echo "  Creating Cloud SQL PostgreSQL instance (this takes a few minutes)..."
  gcloud sql instances create "${DATABASE_INSTANCE}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --database-version=POSTGRES_16 \
    --tier=db-f1-micro \
    --storage-size=10GB \
    --storage-auto-increase \
    --backup-start-time=02:00 \
    --no-assign-ip \
    --require-ssl

  # Create the database
  gcloud sql databases create campus_problem \
    --instance="${DATABASE_INSTANCE}" \
    --project="${PROJECT_ID}"

  # Set the postgres user password (read from Secret Manager or prompt)
  echo ""
  echo "  ⚠️  Set the DB password with:"
  echo "    gcloud secrets create DB_PASSWORD --data-file=- <<< 'YOUR_PASSWORD'"
  echo "    gcloud sql users set-password postgres --instance=${DATABASE_INSTANCE} --password=YOUR_PASSWORD"
  echo ""
  echo "  Or create the secret from a local .env:"
  echo "    grep DB_PASSWORD .env | cut -d= -f2 | gcloud secrets create DB_PASSWORD --data-file=-"
else
  echo "  Instance ${DATABASE_INSTANCE} already exists."
fi

# ---------------------------------------------------------------------------
# 1. Enable required GCP APIs (idempotent — safe to re-run)
# ---------------------------------------------------------------------------
echo ""
echo "[1/6] Enabling required GCP APIs..."
gcloud services enable \
  run.googleapis.com \
  containerregistry.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  --project="${PROJECT_ID}"

# ---------------------------------------------------------------------------
# 2. Build the Docker image using Cloud Build
# ---------------------------------------------------------------------------
echo ""
echo "[2/6] Building Docker image via Cloud Build..."
gcloud builds submit \
  --project="${PROJECT_ID}" \
  --tag="${IMAGE_NAME}:latest" \
  .

# ---------------------------------------------------------------------------
# 3. Deploy to Cloud Run with Cloud SQL Auth Proxy
# ---------------------------------------------------------------------------
echo ""
echo "[3/6] Deploying to Cloud Run..."

# Generate a random Django secret key
DJANGO_SECRET=$(openssl rand -hex 32)

gcloud run deploy "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${IMAGE_NAME}:latest" \
  --platform=managed \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=5 \
  --allow-unauthenticated \
  --add-cloudsql-instances="${INSTANCE_CONNECTION_NAME}" \
  --set-env-vars="DJANGO_DEBUG=False" \
  --set-env-vars="DJANGO_SECRET_KEY=${DJANGO_SECRET}" \
  --set-env-vars="ALLOWED_HOSTS=*,niter-contest.web.app,${SERVICE_NAME}-${PROJECT_ID}.a.run.app" \
  --set-env-vars="FRONTEND_URL=https://niter-contest.web.app" \
  --set-env-vars="DB_NAME=campus_problem" \
  --set-env-vars="DB_USER=postgres" \
  --set-env-vars="DB_SOCKET_PATH=/cloudsql/${INSTANCE_CONNECTION_NAME}" \
  --set-env-vars="DJANGO_TIME_ZONE=Asia/Dhaka" \
  --set-env-vars="ADMIN_PASSKEY=${ADMIN_PASSKEY:-CAMPUS-ADMIN-2026}" \
  --set-secrets="DB_PASSWORD=DB_PASSWORD:latest" \
  --service-account="campus-backend@${PROJECT_ID}.iam.gserviceaccount.com"

# ---------------------------------------------------------------------------
# 4. Run Django migrations on the deployed service
# ---------------------------------------------------------------------------
echo ""
echo "[4/6] Running database migrations..."
gcloud run services execute "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --command="python" \
  --args="manage.py,migrate,--no-input" 2>/dev/null || \
  echo "  (migrations skipped — run manually if needed)"

# ---------------------------------------------------------------------------
# 5. Collect static files
# ---------------------------------------------------------------------------
echo ""
echo "[5/6] Collecting static files..."
gcloud run services execute "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --command="python" \
  --args="manage.py,collectstatic,--no-input" 2>/dev/null || \
  echo "  (collectstatic skipped — run manually if needed)"

# ---------------------------------------------------------------------------
# 6. Print the service URL
# ---------------------------------------------------------------------------
echo ""
echo "[6/6] Deployment complete!"
echo ""
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format="value(status.url)")

echo "✅ Service URL: ${SERVICE_URL}"
echo ""
echo "Next steps:"
echo "  1. Deploy the frontend: firebase deploy --only hosting"
echo "  2. Visit https://niter-contest.web.app"
