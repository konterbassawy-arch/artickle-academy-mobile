#!/bin/bash
# One-time setup: creates the GCS backup bucket and wires up IAM.
# Run this once from the project root: bash scripts/setup-backup.sh

set -euo pipefail

PROJECT_ID="artickle-academy"
BUCKET="artickle-academy-backups"
REGION="us-central1"

# ── 1. Install gcloud SDK if missing ────────────────────────────────────────
if ! command -v gcloud &> /dev/null; then
  echo "gcloud not found — installing Google Cloud SDK (ARM)..."
  TMP=$(mktemp -d)
  curl -fsSL \
    "https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-darwin-arm.tar.gz" \
    -o "$TMP/gcloud.tar.gz"
  tar -xf "$TMP/gcloud.tar.gz" -C "$TMP"
  "$TMP/google-cloud-sdk/install.sh" --quiet --path-update true
  # Source for this session
  # shellcheck disable=SC1091
  source "$TMP/google-cloud-sdk/path.bash.inc"
  rm -rf "$TMP"
  echo "gcloud installed. You may need to restart your terminal for PATH changes."
fi

# ── 2. Authenticate & set project ───────────────────────────────────────────
echo ""
echo "==> Authenticating with Google Cloud (a browser window will open)..."
gcloud auth login --project="$PROJECT_ID"
gcloud config set project "$PROJECT_ID"

# ── 3. Enable required APIs ─────────────────────────────────────────────────
echo ""
echo "==> Enabling APIs..."
gcloud services enable \
  firestore.googleapis.com \
  storage.googleapis.com \
  cloudscheduler.googleapis.com \
  cloudfunctions.googleapis.com

# ── 4. Create the backup bucket ─────────────────────────────────────────────
echo ""
echo "==> Creating bucket gs://$BUCKET ..."
if gcloud storage buckets describe "gs://$BUCKET" &>/dev/null; then
  echo "    Bucket already exists — skipping creation."
else
  gcloud storage buckets create "gs://$BUCKET" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --uniform-bucket-level-access
fi

# ── 5. Set 30-day auto-delete lifecycle ─────────────────────────────────────
LIFECYCLE_FILE=$(mktemp /tmp/lifecycle.XXXXXX.json)
cat > "$LIFECYCLE_FILE" <<'JSON'
{
  "rule": [
    {
      "action": { "type": "Delete" },
      "condition": { "age": 30 }
    }
  ]
}
JSON
gcloud storage buckets update "gs://$BUCKET" --lifecycle-file="$LIFECYCLE_FILE"
rm -f "$LIFECYCLE_FILE"
echo "    30-day retention policy applied."

# ── 6. Grant IAM permissions ─────────────────────────────────────────────────
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")

# Cloud Functions v2 runs as the Compute Engine default service account
COMPUTE_SA="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
# Firestore uses its own SA to write export files to GCS
FIRESTORE_SA="service-$PROJECT_NUMBER@gcp-sa-firestore.iam.gserviceaccount.com"

echo ""
echo "==> Granting storage write access..."

gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$COMPUTE_SA" \
  --role="roles/storage.admin"

gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$FIRESTORE_SA" \
  --role="roles/storage.admin"

# The Cloud Function also needs permission to call the Firestore export API
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$COMPUTE_SA" \
  --role="roles/datastore.importExportAdmin"

# ── 7. Done ──────────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo " Setup complete!"
echo " Bucket   : gs://$BUCKET"
echo " Retention: 30 days (oldest backups auto-deleted)"
echo ""
echo " Next step — deploy the backup Cloud Function:"
echo "   cd functions && npm run build && firebase deploy --only functions"
echo "============================================================"
