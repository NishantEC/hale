# Runbook: compute-engine fallback / outage

## What this service does

`noop-compute-engine` is a Rust service on Cloud Run that takes one
day's worth of pipeline inputs (signal samples, sensor records, night
features, sleep detections, baseline) and returns the persisted
daily-metric scalars (strain, recovery, stress, spo2, training load,
etc.). NestJS calls it per day during the pipeline `compute` stage
behind a feature flag; on any failure NestJS falls back to the in-process
JS implementation. The JS path is the safety net — service can go fully
down without user-visible regression.

## Error budget — Phase 1

| Metric | Target | Hard ceiling |
|---|---|---|
| Per-day fallback rate | <0.1% over 24h | <5% over 30min (alert wakes oncall) |
| Schema drift errors (`bad_request`, `malformed_response`) | 0 per 5min | 1 per 5min (alert) |
| Auth errors (`auth_error`) | 0 per 5min | 1 per 5min (alert) |
| Panics | 0 per minute | 1 per minute (alert) |

## How to disable (emergency stop)

If alerts fire or you see degraded user behavior tied to compute-engine,
flip the feature flag off on the backend:

```bash
gcloud run services update noop-backend \
  --region=us-central1 \
  --update-env-vars=COMPUTE_ENGINE_ENABLED=false \
  --project=flashckard
```

Effect: backend stops calling Rust, runs JS path in-process for every
day. No data loss; results identical (modulo any Rust-side bug under
investigation). Effect is per-revision — once the env var is set, no
further deploy needed.

## How to re-enable after fix

```bash
gcloud run services update noop-backend \
  --region=us-central1 \
  --update-env-vars=COMPUTE_ENGINE_ENABLED=true \
  --project=flashckard
```

Watch dashboards for 30min. If fallback rate returns above the ceiling
within 1 hour, leave disabled and escalate to the on-call engineer.

## Diagnostic queries

Fallback breakdown by reason (last 1h):
```bash
gcloud logging read 'jsonPayload.event="compute-engine-fallback"' \
  --project=flashckard --freshness=1h --format='value(jsonPayload.reason)' \
  | sort | uniq -c
```

Slow day-computes (>10s):
```bash
gcloud logging read 'jsonPayload.event=("compute-engine-success" OR "compute-engine-fallback") AND jsonPayload.duration_ms>10000' \
  --project=flashckard --freshness=1h --limit=50
```

Recent panics:
```bash
gcloud logging read 'resource.labels.service_name="noop-compute-engine" AND textPayload=~"panicked at"' \
  --project=flashckard --freshness=1h --limit=20
```

Latency p95 over last 30 min (via Cloud Logging-derived metric):
```bash
# Use Cloud Console → Metrics Explorer → metric=compute_engine_latency_seconds, aggregation=p95, filter outcome=rust_ok
```

## Page-level responses

| Alert | What it means | Action |
|---|---|---|
| `compute-engine auth_error` | IAM is broken — backend SA lost `roles/run.invoker` on compute-engine | Re-grant: `gcloud run services add-iam-policy-binding noop-compute-engine --region=us-central1 --member=serviceAccount:noop-cloud-run@flashckard.iam.gserviceaccount.com --role=roles/run.invoker --project=flashckard` |
| `compute-engine schema_drift` | TS↔Rust wire contract diverged | Find the most-recent compute-engine or backend merge to main; revert if it changed types. Schema mismatch = a deploy slipped through |
| `compute-engine panic` | Rust function panicked on unexpected input | Capture the panic line + the failing request payload from logs. Add the payload as a new golden fixture (with anonymization). Fix Rust. Re-deploy. |
| `compute-engine high fallback rate` | Service degraded but not catastrophic | Check latency + recent deploys. If degraded post-deploy, roll back: `gcloud run services update-traffic noop-compute-engine --to-revisions=<previous-revision>=100 --region=us-central1 --project=flashckard` |

## Operational facts

- Feature flag: `COMPUTE_ENGINE_ENABLED=true|false` on `noop-backend` Cloud Run service env vars
- URL: stored in `COMPUTE_ENGINE_URL` env var on `noop-backend`
- Timeout: 30s per-day request (set by client), 25s server-side deadline (returns 503)
- Authentication: ID token from GCP metadata server, audience = compute service URL
- Required IAM: backend SA (`noop-cloud-run@flashckard.iam.gserviceaccount.com`) has `roles/run.invoker` on `noop-compute-engine`
- Sticky fallback: once a pipeline run falls back for any day, subsequent days that run also use JS (avoids hammering a degraded service)
