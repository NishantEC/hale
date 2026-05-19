#!/usr/bin/env bash
# Idempotent — re-running is safe (existing metrics get an error swallowed).
# Creates 3 log-based metrics for compute-engine observability.
set -euo pipefail
PROJECT=${PROJECT:-flashckard}

echo "[1/3] compute_engine_requests_total"
cat > /tmp/metric-requests.yaml <<'EOF'
name: compute_engine_requests_total
description: Compute-engine request count by endpoint + outcome
filter: jsonPayload.event=("compute-engine-success" OR "compute-engine-fallback")
metricDescriptor:
  metricKind: DELTA
  valueType: INT64
  labels:
    - key: endpoint
      valueType: STRING
    - key: outcome
      valueType: STRING
labelExtractors:
  endpoint: EXTRACT(jsonPayload.endpoint)
  outcome: EXTRACT(jsonPayload.outcome)
EOF
gcloud logging metrics create compute_engine_requests_total \
  --config-from-file=/tmp/metric-requests.yaml \
  --project=$PROJECT || echo "  (already exists)"

echo "[2/3] compute_engine_latency_seconds (DISTRIBUTION)"
cat > /tmp/metric-latency.yaml <<'EOF'
name: compute_engine_latency_seconds
description: Compute-engine round-trip latency (ms) by endpoint + outcome
filter: jsonPayload.event=("compute-engine-success" OR "compute-engine-fallback")
metricDescriptor:
  metricKind: DELTA
  valueType: DISTRIBUTION
  unit: ms
  labels:
    - key: endpoint
      valueType: STRING
    - key: outcome
      valueType: STRING
labelExtractors:
  endpoint: EXTRACT(jsonPayload.endpoint)
  outcome: EXTRACT(jsonPayload.outcome)
valueExtractor: EXTRACT(jsonPayload.duration_ms)
bucketOptions:
  explicitBuckets:
    bounds: [50, 100, 500, 1000, 5000, 30000]
EOF
gcloud logging metrics create compute_engine_latency_seconds \
  --config-from-file=/tmp/metric-latency.yaml \
  --project=$PROJECT || echo "  (already exists)"

echo "[3/3] compute_engine_panics_total"
gcloud logging metrics create compute_engine_panics_total \
  --description="Rust panics in compute-engine" \
  --log-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="noop-compute-engine" AND severity="ERROR" AND textPayload=~"panicked at"' \
  --project=$PROJECT || echo "  (already exists)"

echo "metrics created"
