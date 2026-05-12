#!/usr/bin/env bash
# Ad-hoc pg_dump → GCS uploader for the production Postgres instance.
#
# Usage:
#   PROJECT_ID=flashckard \
#   CLOUDSQL_INSTANCE=flashckard:us-central1:noop-db \
#   DB_NAME=noop \
#   DB_USER=noop \
#   BACKUP_BUCKET=gs://noop-backups \
#   ./apps/backend/scripts/backup-db.sh
#
# Prereqs: `gcloud` authed to a service account with
#   - cloudsql.instances.export
#   - storage.objects.create on $BACKUP_BUCKET
#
# Cloud SQL has native automated backups too — enable those for
# point-in-time recovery (PITR). This script is for ad-hoc dumps you
# want to download/inspect locally or copy to a different region.

set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID env required}"
: "${CLOUDSQL_INSTANCE:?CLOUDSQL_INSTANCE env required (project:region:instance)}"
: "${DB_NAME:?DB_NAME env required}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET env required (gs://your-bucket)}"

INSTANCE_NAME="${CLOUDSQL_INSTANCE##*:}"
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
BACKUP_URI="${BACKUP_BUCKET}/${DB_NAME}/${DB_NAME}-${TIMESTAMP}.sql.gz"

echo "Exporting ${DB_NAME} from ${INSTANCE_NAME} → ${BACKUP_URI}"

gcloud sql export sql "${INSTANCE_NAME}" "${BACKUP_URI}" \
  --database="${DB_NAME}" \
  --project="${PROJECT_ID}" \
  --offload

echo "Done. To download:"
echo "  gsutil cp ${BACKUP_URI} ./"
echo "To restore locally:"
echo "  gunzip -c ${DB_NAME}-${TIMESTAMP}.sql.gz | psql -h localhost -U noop noop"
