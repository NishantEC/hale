#!/usr/bin/env bash
# Enable Cloud SQL automated backups + point-in-time recovery on the
# production Postgres instance. Idempotent — re-running just confirms the
# current config matches the desired state.
#
# Usage:
#   PROJECT_ID=flashckard \
#   CLOUDSQL_INSTANCE=noop-db \
#   REGION=us-central1 \
#   ./apps/backend/scripts/setup-cloud-sql-backups.sh
#
# What this configures:
#   - Daily backups at 03:00 UTC, retained for 14 days
#   - Binary logging (required for PITR)
#   - PITR retention of 7 days
# All settings cost incremental storage; see Cloud SQL pricing.

set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID env required}"
: "${CLOUDSQL_INSTANCE:?CLOUDSQL_INSTANCE env required (short name)}"

gcloud sql instances patch "${CLOUDSQL_INSTANCE}" \
  --project="${PROJECT_ID}" \
  --backup-start-time=03:00 \
  --enable-bin-log \
  --retained-backups-count=14 \
  --retained-transaction-log-days=7 \
  --quiet

echo "Backups enabled. Inspect with:"
echo "  gcloud sql backups list --instance=${CLOUDSQL_INSTANCE} --project=${PROJECT_ID}"
