#!/usr/bin/env bash
# Creates a Cloud Monitoring uptime check for noop-backend /readyz plus an
# alert policy that emails on failure. This REPLACES the GitHub Actions cron
# that used to live in .github/workflows/uptime.yml.
#
# Why we moved it: GitHub bills every Actions job rounded UP to a whole minute,
# so the old "*/10" ping cost ~1 Actions minute per run (~4,320 min/month at
# the intended cadence) — it was draining the account-wide Actions quota that
# every repo shares. Cloud Monitoring uptime checks are FREE and ping from
# multiple regions, with native alerting.
#
# Idempotent: skips creation if the channel / check / policy already exist.
# Safe to re-run.
#
# Requires: gcloud auth, `gcloud components install alpha`, and jq.
set -euo pipefail

PROJECT=${PROJECT:-flashckard}
HOST=${HOST:-api.noop.enform.co}
CHECK_PATH=${CHECK_PATH:-/readyz}
ALERT_EMAIL=${ALERT_EMAIL:-guptanishant1307@gmail.com}
CHECK_NAME="noop-backend readyz"
POLICY_NAME="noop-backend uptime"

# 1. Notification channel (email) — reuse existing or create.
CHANNEL=$(gcloud alpha monitoring channels list --project="$PROJECT" \
  --filter="type=\"email\" AND labels.email_address=\"$ALERT_EMAIL\"" \
  --format="value(name)" | head -1)
if [ -z "$CHANNEL" ]; then
  CHANNEL=$(gcloud alpha monitoring channels create \
    --project="$PROJECT" --display-name="noop alerts ($ALERT_EMAIL)" \
    --type=email --channel-labels="email_address=$ALERT_EMAIL" \
    --format="value(name)")
  echo "Created notification channel: $CHANNEL"
else
  echo "Reusing notification channel: $CHANNEL"
fi

# 2. Uptime check (HTTPS GET /readyz, expects 2xx + body contains "ok":true).
#    period=5 min, run from all regions. Free.
CHECK_FULL=$(gcloud monitoring uptime list-configs --project="$PROJECT" \
  --filter="displayName=\"$CHECK_NAME\"" --format="value(name)" | head -1)
if [ -z "$CHECK_FULL" ]; then
  gcloud monitoring uptime create "$CHECK_NAME" \
    --project="$PROJECT" \
    --resource-type=uptime-url \
    --resource-labels="host=$HOST,project_id=$PROJECT" \
    --protocol=https --port=443 --path="$CHECK_PATH" --request-method=get \
    --status-classes=2xx \
    --matcher-content='"ok":true' --matcher-type=contains-string \
    --period=5 --timeout=30
  CHECK_FULL=$(gcloud monitoring uptime list-configs --project="$PROJECT" \
    --filter="displayName=\"$CHECK_NAME\"" --format="value(name)" | head -1)
  echo "Created uptime check: $CHECK_FULL"
else
  echo "Reusing uptime check: $CHECK_FULL"
fi
CHECK_ID="${CHECK_FULL##*/}"
echo "check_id=$CHECK_ID"

# 3. Alert policy — fires when >1 checker region reports /readyz failing for 5m.
EXISTING_POLICY=$(gcloud alpha monitoring policies list --project="$PROJECT" \
  --filter="displayName=\"$POLICY_NAME\"" --format="value(name)" | head -1)
if [ -n "$EXISTING_POLICY" ]; then
  echo "Reusing alert policy: $EXISTING_POLICY"
  exit 0
fi

jq -n \
  --arg name "$POLICY_NAME" \
  --arg filter "resource.type=\"uptime_url\" AND metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.label.check_id=\"$CHECK_ID\"" \
  --arg channel "$CHANNEL" \
  '{
    displayName: $name,
    combiner: "OR",
    conditions: [{
      displayName: "noop-backend /readyz failing",
      conditionThreshold: {
        filter: $filter,
        aggregations: [{
          alignmentPeriod: "300s",
          perSeriesAligner: "ALIGN_NEXT_OLDER",
          crossSeriesReducer: "REDUCE_COUNT_FALSE",
          groupByFields: ["resource.label.host"]
        }],
        comparison: "COMPARISON_GT",
        thresholdValue: 1,
        duration: "300s",
        trigger: { count: 1 }
      }
    }],
    notificationChannels: [$channel],
    enabled: true
  }' > /tmp/noop-uptime-policy.json

gcloud alpha monitoring policies create \
  --project="$PROJECT" --policy-from-file=/tmp/noop-uptime-policy.json
echo "Created alert policy: $POLICY_NAME"
