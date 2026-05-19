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
  CHANNELS_JSON='[]'
else
  CHANNELS_JSON="[\"$NOTIFY_CHANNEL\"]"
fi

# Builds a proper policy JSON via jq, avoiding nested-quote escaping bugs.
create_policy() {
  local name="$1" filter="$2" threshold="$3" duration="$4"
  jq -n \
    --arg name "$name" \
    --arg filter "$filter" \
    --argjson threshold "$threshold" \
    --arg duration "$duration" \
    --argjson channels "$CHANNELS_JSON" \
    '{
      displayName: $name,
      conditions: [{
        displayName: ($name + " condition"),
        conditionThreshold: {
          filter: $filter,
          comparison: "COMPARISON_GT",
          thresholdValue: $threshold,
          duration: $duration,
          aggregations: [{
            alignmentPeriod: "60s",
            perSeriesAligner: "ALIGN_RATE"
          }]
        }
      }],
      combiner: "OR",
      notificationChannels: $channels,
      enabled: true
    }' > /tmp/policy.json
  gcloud alpha monitoring policies create --policy-from-file=/tmp/policy.json --project=$PROJECT
}

# Log-based metrics need an explicit resource.type filter. Both
# compute_engine_requests_total (emitted by NestJS on noop-backend) and
# compute_engine_panics_total (emitted by Rust on noop-compute-engine)
# resolve to resource.type=cloud_run_revision.
COMMON_RESOURCE='resource.type="cloud_run_revision"'

# 1. Auth error: any > 0 rate over 5min (means IAM is broken)
create_policy "compute-engine auth_error" \
  "$COMMON_RESOURCE AND metric.type=\"logging.googleapis.com/user/compute_engine_requests_total\" AND metric.labels.outcome=\"fallback_auth_error\"" \
  0 300s

# 2. Schema drift: bad_request / malformed_response > 0 over 5min
create_policy "compute-engine schema_drift" \
  "$COMMON_RESOURCE AND metric.type=\"logging.googleapis.com/user/compute_engine_requests_total\" AND (metric.labels.outcome=\"fallback_bad_request\" OR metric.labels.outcome=\"fallback_malformed_response\")" \
  0 300s

# 3. Total fallback rate > 5/min sustained for 30min
create_policy "compute-engine high fallback rate" \
  "$COMMON_RESOURCE AND metric.type=\"logging.googleapis.com/user/compute_engine_requests_total\" AND metric.labels.outcome=monitoring.regex.full_match(\"fallback_.*\")" \
  0.083 1800s

# 4. Panic > 0
create_policy "compute-engine panic" \
  "$COMMON_RESOURCE AND metric.type=\"logging.googleapis.com/user/compute_engine_panics_total\"" \
  0 60s

echo "alert policies created"
