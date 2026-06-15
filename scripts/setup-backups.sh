#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# ARTickle Academy — Backup System Setup
# Run once to create the GCS bucket, set 30-day retention, and grant permissions.
# ─────────────────────────────────────────────────────────────────────────────

set -e

PROJECT_ID="artickle-academy"
BUCKET="artickle-academy-backups"
REGION="us-central1"

echo "▶ Creating GCS bucket gs://$BUCKET ..."
gcloud storage buckets create "gs://$BUCKET" \
  --project="$PROJECT_ID" \
  --location="$REGION" \
  --uniform-bucket-level-access

echo "▶ Setting 30-day lifecycle (auto-delete old backups) ..."
cat > /tmp/lifecycle.json <<'EOF'
{
  "lifecycle": {
    "rule": [
      {
        "action": { "type": "Delete" },
        "condition": { "age": 30 }
      }
    ]
  }
}
EOF
gcloud storage buckets update "gs://$BUCKET" --lifecycle-file=/tmp/lifecycle.json

echo "▶ Granting Firestore export permission to Cloud Functions service account ..."
SA="$PROJECT_ID@appspot.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA" \
  --role="roles/datastore.importExportAdmin"

gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$SA" \
  --role="roles/storage.admin"

echo ""
echo "✅ Bucket ready. Now set your email secrets:"
echo ""
echo "   firebase functions:secrets:set BACKUP_GMAIL_USER"
echo "   (enter your Gmail address, e.g. you@gmail.com)"
echo ""
echo "   firebase functions:secrets:set BACKUP_GMAIL_APP_PASSWORD"
echo "   (enter your Gmail App Password — NOT your regular password)"
echo "   Get one at: https://myaccount.google.com/apppasswords"
echo ""
echo "   firebase functions:secrets:set BACKUP_EMAIL_TO"
echo "   (enter the email address that should RECEIVE the daily report)"
echo ""
echo "Then deploy:"
echo "   firebase deploy --only functions"
