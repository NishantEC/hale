#!/usr/bin/env bash
# Requires `gcloud components install alpha`. Run before executing this:
#   gcloud components install alpha
# Idempotent — re-running creates new policies with the same name, which is
# undesirable; check existing policies before running:
#   gcloud alpha monitoring policies list --project=flashckard --filter='displayName:"compute-engine"'
# If they already exist, skip.
set -euo pipefail
PROJECT=${PROJECT:-flashckard}

NOTIFY_CHANNEL=$(gcloud alpha monitoring channels list --project=$PROJECT --format="value(name)" | head -1)
if [ -z "$NOTIFY_CHANNEL" ]; then
  echo "WARNING: no monitoring notification channels in $PROJECT — policies will be created without paging targets."
  echo "Configure a channel in Cloud Console > Monitoring > Notifications > Channels first, then re-run."
  CHANNEL_FIELD=""
else
  CHANNEL_FIELD="\"notificationChannels\": [\"$NOTIFY_CHANNEL\"],"
fi

create_policy() {
  local name="$1"; local filter="$2"; local threshold="$3"; local duration="$4"
  cat > /tmp/policy.json <<EOF
{
  "displayName": "$name",
  "conditions": [{
    "displayName": "$name condition",
    "conditionThreshold": {
      "filter": "$filter",
      "comparison": "COMPARISON_GT",
      "thresholdValue": $threshold,
      "duration": "$duration",
      "aggregations": [{ "alignmentPeriod": "60s", "perSeriesAligner": "ALIGN_RATE" }]
    }
  }],
  "combiner": "OR",
  $CHANNEL_FIELD
  "enabled": true
}
EOF
  gcloud alpha monitoring policies create --policy-from-file=/tmp/policy.json --project=$PROJECT
}

# 1. Auth error: any > 0 rate over 5min (means IAM is broken)
create_policy "compute-engine auth_error" \
  'metric.type="logging.googleapis.com/user/compute_engine_requests_total" AND metric.labels.outcome="fallback_auth_error"' \
  0 300s

# 2. Schema drift: bad_request / malformed_response > 0 over 5min
create_policy "compute-engine schema_drift" \
  'metric.type="logging.googleapis.com/user/compute_engine_requests_total" AND (metric.labels.outcome="fallback_bad_request" OR metric.labels.outcome="fallback_malformed_response")' \
  0 300s

# 3. Total fallback rate > 5/min sustained for 30min
create_policy "compute-engine high fallback rate" \
  'metric.type="logging.googleapis.com/user/compute_engine_requests_total" AND metric.labels.outcome=monitoring.regex.full_match("fallback_.*")' \
  0.083 1800s

# 4. Panic > 0
create_policy "compute-engine panic" \
  'metric.type="logging.googleapis.com/user/compute_engine_panics_total"' \
  0 60s

echo "alert policies created"
