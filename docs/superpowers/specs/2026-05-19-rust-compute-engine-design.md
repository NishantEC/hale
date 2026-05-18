# Rust Compute Engine for Pipeline Hot Path

**Date:** 2026-05-19
**Status:** Spec, revised after Codex review (round 1). Awaiting user re-review.
**Scope:** New Rust service that takes over the `compute` stage of the wellness pipeline; NestJS retains the JS implementation as a fallback.

---

## Current baseline (prod, last 14 days)

Source: `pipeline_runs` table on prod, `startedAt > NOW() - INTERVAL '14 days'`, 231 non-skipped runs.

| Metric | Value |
|---|---|
| Runs sampled | 231 |
| Avg days per run | 2.4 |
| Total runtime p50 | 247.6s |
| Total runtime p95 | 1,312.4s |
| Compute stage p50 | 241.5s |
| Compute stage p95 | 1,141.2s |
| **Mean compute share of total** | **89.3%** |
| **Median compute share of total** | **98.0%** |
| Fetch p50 | 2.2s |
| Write p50 | 1.3s |
| Write p95 | 408s (DB contention outlier; separate concern) |

**Per-day compute cost (averaged across same-`days` runs):**

| Days | n | Avg compute (s) | Per-day avg (s) |
|---|---|---|---|
| 1 | 5 | 378.1 | 378.1 |
| 2 | 139 | 309.9 | 155.0 |
| 3 | 78 | 423.4 | 141.1 |
| 4 | 5 | 1267.9 | 317.0 |
| 5 | 3 | 1449.1 | 289.8 |

JS does some amortization (1→3 days drops per-day from 378s to 141s) but per-day cost stays in the **140–380s** range. Write spikes (p95 408s) are real but orthogonal to this project.

**Conclusion:** the spec's central premise — compute is the dominant bottleneck — is supported by the data. Median compute share is 98% of total pipeline time. Codex's earlier concern that compute may already be cheap (cited a `120ms` from `operations.md` example) does not match observed prod behavior; that example was a trivial single-day run with little input.

---

## Goal

Port the `compute` stage to Rust and call it from NestJS over HTTPS. Keep the JS implementation in place as the fallback. Target a 5–10× compute speedup on multi-day windows; that turns a worst-case ~22 min run into ~2–4 min.

## Non-goals

- Replacing `fetch`, `sleep-detect`, `activity-detect`, `sleep-stages`, or `write` stages.
- Reading from CloudSQL inside the Rust service. NestJS keeps DB ownership.
- Removing any JS pipeline code. JS path remains a complete, working implementation.
- Production rollout in one shot. Phased plan with measurable gates.

---

## Architecture

**Two services, same GCP project:**
- `noop-backend` (existing NestJS, Cloud Run) — owns CloudSQL, ingestion, orchestration, write transactions, AND the fallback compute implementation.
- `noop-compute-engine` (new Rust, Cloud Run) — pure compute. Receives inputs over HTTPS/JSON, returns outputs. No DB. No auth secrets. Just math.

**Inter-service auth:** Cloud Run service-to-service via Google-issued ID tokens.
- Compute engine deployed with `--no-allow-unauthenticated`.
- Backend's service account (`noop-cloud-run@flashckard.iam.gserviceaccount.com`, same SA the backend Cloud Run service runs as — see `.github/workflows/deploy-backend.yml:69`) is granted `roles/run.invoker` on `noop-compute-engine`.
- NestJS fetches the ID token from the metadata server with the audience set to the compute service URL (`https://noop-compute-engine-<hash>-uc.a.run.app`, NOT a custom domain), then sends `Authorization: Bearer <id-token>` on every request.

**Data flow per pipeline run (when feature flag on):**

```
NestJS:
  1. fetch raw data from CloudSQL (unchanged)
  2. sleep-detect, activity-detect, sleep-stages (unchanged)
  3. instead of running the per-day compute loop in-process:
     POST https://compute-engine/.../compute/batch
     body: ComputeBatchRequestV1
     headers: Authorization: Bearer <id-token>
  4. Rust returns: ComputeBatchResultV1
  5. NestJS persists results in the existing write transaction (unchanged)
```

**Fallback path (Rust unreachable / non-2xx / timeout / malformed response):**

```
NestJS:
  3a. POST to Rust fails (see "Fallback semantics" for what counts).
  3b. Log structured warning with reason + duration.
  3c. Increment metric `compute_fallback_total{reason}`.
  3d. Run the existing JS per-day loop in-process.
  3e. Persist as today.
```

The JS code path is exercised by tests, golden fixtures, and the shadow flag, so it doesn't bit-rot. Production calls fall back only when Rust is actually unreachable.

---

## Communication protocol

**JSON over HTTPS, with gzip request/response compression.** Reasons:
- Debuggable. We can hit the endpoint with `curl` to compare against fixtures.
- One serialization library on both sides (`serde_json` / `JSON.stringify`).
- Parse overhead is bounded; see "Payload budget" below.

**Payload budget.** Cloud Run HTTP/1 has a hard **32 MiB request and 32 MiB non-streaming response limit**. Worst-case spec-sized payload back-of-envelope:
- 45-day window with continuous strap = ~3.9M `HistoricalSensorRecord` rows? No — strap samples at ~1 Hz only when worn. Real prod: ~150k records for a 45-day window. Each record JSON-encoded is ~250B (17 nullable numeric fields). Estimated request body: **~37 MiB uncompressed**, **~5–7 MiB gzipped**.
- Response (persisted scalars only, see "Data contract") is bounded by `numDays × ~600B per day` ≈ **30 KiB for 45 days**.

So request is close to the uncompressed limit; gzip mandatory. **Task 0 of the implementation plan must measure real payload size for a 45-day run and abort if gzipped request exceeds 16 MiB** (50% headroom). If exceeded, the plan switches to streaming + chunked-by-day requests, or MessagePack.

If profiling later shows JSON parse becoming the bottleneck (>10% of total per-request time), we swap to MessagePack — same `serde` derives on the Rust side. Not in initial scope.

**Axum body limits.** axum defaults to a 2 MiB request body limit. Gzipped Phase 1 day-requests stay under 1 MiB in practice, but the future batch endpoint and any unusually large day will need a higher cap. Set `DefaultBodyLimit::max(32 * 1024 * 1024)` on the request decompression layer to match Cloud Run's hard limit. The decompressed body is allocated by `serde_json::from_slice`, so an attacker who gzips a 32 MiB JSON to <1 MiB could expand it server-side; we accept this risk because the endpoint is auth-only (IAM-gated, not exposed publicly).

---

## Tech choices

- **HTTP server:** [`axum`](https://docs.rs/axum) — minimal, mature, async, fits Cloud Run cold-start model.
- **Async runtime:** `tokio`. CPU-bound compute runs on a `tokio::task::spawn_blocking` thread (or a dedicated `rayon` thread pool in Phase 2). **Compute MUST NOT block tokio worker threads** — that would prevent the server from accepting new requests during a compute run.
- **JSON:** `serde` + `serde_json`.
- **Compression:** `tower-http::compression::CompressionLayer` (response) + `tower-http::decompression::RequestDecompressionLayer` (request). NestJS uses native `zlib` for gzip.
- **Time:** `chrono` + `chrono-tz` for IANA timezone math (mirrors `apps/backend/src/common/calendar.ts`).
- **Logging:** `tracing` + `tracing-subscriber` (structured JSON to stdout → Cloud Logging).
- **No gRPC for now** — adds protobuf compilation step and code-gen on both sides. Revisit only if JSON shows up in profiling.
- **No napi-rs** — would tie deploys to native compilation per arch. Wrong tradeoff for a separately-deployable service.

---

## Phased rollout

### Phase 1 — Proof of concept (2–3 days)

Single endpoint: `POST /v1/compute/derived-metrics-day`. Takes inputs for ONE day, returns `PersistedDailyMetricV1`. Ports just `computeDerivedMetrics` and its transitive math (TRIMP/strain, stress series, spo2 series, skin-temp series, rolling RMSSD, sleep consistency, recovery index, training load, core temp, spo2 desaturation events).

NestJS calls this inside its existing per-day loop, behind env flag `COMPUTE_ENGINE_ENABLED`.

**Promotion criterion — REVISED.** Codex correctly flagged that gating Phase 1 on `≥5× compute-stage HTTP speedup` is wrong: Phase 1 makes one HTTP call per day, defeating the JS precompute hoisting. So the Phase 1 gate is:

1. **Correctness parity.** Golden fixtures (5–10 real days) + a 1-week shadow run on staging show every persisted scalar matches JS within `1e-4` (absolute) for floats, byte-exact for everything else.
2. **Local function microbenchmark.** `cargo bench` on `compute_derived_metrics_day` shows **≥5× speedup** vs. the equivalent JS function call on the same fixture (Node `process.hrtime.bigint()`-based benchmark). This measures the math speedup independent of HTTP/network/serialization overhead.
3. **End-to-end sanity.** Real Cloud Run round-trip P95 (one day's worth of input) under 5s. We're not gating on per-day speed because per-day HTTP is the wrong shape; we just need round-trip to be tolerable.

Only if all three pass: proceed to Phase 2.

### Phase 2 — Batch endpoint (4–5 days, only if Phase 1 promotes)

New endpoint: `POST /v1/compute/batch`. Takes the full pipeline window in one request, returns all derived results. NestJS replaces the entire per-day loop with one call. Adds the other compute-stage functions: `recomputeBaselineProfile`, `computeDailyScore` (looped server-side in Rust), `computeSleepScoreForNight` (looped server-side), `computeTypicalRanges`, `journalSleepCorrelations`.

This eliminates per-day HTTP overhead AND lets Rust internally parallelize across days with `rayon` (one Rayon worker per CPU).

**Promotion criterion.** End-to-end pipeline P95 dropped by ≥5× on a 5-day backfill, measured against the current `main` baseline. Fallback rate <0.1% over a 100-run sample.

### Phase 3 — Production (2 days, only after Phase 2 stable for 1 week)

- GitHub Actions deploy workflow (`deploy-compute-engine.yml`) mirroring backend.
- Feature flag default `true` in prod env vars.
- Monitor `compute_fallback_total{reason}` counter and `compute_engine_latency_seconds` histogram for 1 week.
- If fallback rate stays <0.1%, leave JS path in but stop actively maintaining its perf.

JS implementation is kept indefinitely as the documented fallback. No removal plan.

---

## Data contracts (versioned)

All shapes carry a `V1` suffix. A future `V2` would mean a breaking change — we'd run both endpoints during transition. Schemas are committed in:
- TypeScript: `apps/backend/src/pipeline/compute-engine-types.ts`
- Rust: `apps/compute-engine/src/types.rs`

CI runs a parity test that round-trips a sample payload through both serializers; mismatched field names fail the build.

### Phase 1 — single day

```jsonc
// POST /v1/compute/derived-metrics-day
// Request: ComputeDerivedMetricsDayRequestV1
{
  "schemaVersion": 1,
  "samples": [{
    "timestamp": "2026-05-18T05:00:00.000Z",
    "source": "strap-history",       // required by SignalSample
    "heartRate": 78,
    "ibiMs": 769,
    "motionScore": null,
    "qualityScore": 1
  }],
  "sensorRecords": [{
    "timestamp": "2026-05-18T05:00:00.000Z",
    "heartRate": 78,
    "rrAverageMs": 769,
    "spo2Red": null,
    "spo2IR": null,
    "skinTempRaw": null,
    "gravityMagnitude": null,
    "gravityX": null,
    "gravityY": null,
    "gravityZ": null,
    "respRateRaw": null,
    "skinContact": true,
    "ppgGreen": null,
    "ppgRedIr": null,
    "ambientLight": null,
    "ledDrive1": null,
    "ledDrive2": null,
    "signalQuality": null
  }],
  "nightFeatures": [/* NightFeatureSet[] */],
  "sleepDetections": [/* SleepDetectionSummary[] */],
  "baseline": {
    "restingHeartRate": 57,
    "rmssd": 58,
    "sdnn": 65,
    "nightsUsed": 9,
    "isWarmedUp": true,             // required by BaselineProfile
    "maxHeartRate": 190
  },
  "referenceDate": "2026-05-18",
  "timeZone": "Asia/Kolkata"
}

// Response: PersistedDailyMetricV1
// Only the scalars that upsertDailyMetric (pipeline.service.ts:1167)
// actually persists. Time series (stressScores, spo2Scores, skinTempScores,
// hrvRmssdSeries) are produced by JS but never stored or read — they're
// dead-weight in the network payload. We drop them.
{
  "schemaVersion": 1,
  "strainScore": 13.2,
  "sleepConsistencyScore": 78,
  "detectedSleepNights": 5,
  "skinTempAvgCelsius": 33.5,
  "skinTempDeltaCelsius": 0.1,
  "stressAverage": 0.85,
  "spo2Average": 97.0,
  "lfHfRatioAverage": null,
  "recoveryIndex": 73,
  "trainingLoadRatio": 1.05,
  "trainingLoadRiskZone": "OPTIMAL",
  "spo2DipCount": 0,
  "odiPerHour": null,
  "lowestSpo2": 96.0,
  "coreTemperatureEstimate": null,
  "circadianNadir": null,
  "sleepArchitectureScore": null
}
```

### Phase 2 — batch

```jsonc
// POST /v1/compute/batch
// Request: ComputeBatchRequestV1
{
  "schemaVersion": 1,
  "samples": [/* SignalSample[] */],
  "sensorRecords": [/* HistoricalSensorRecord[] */],
  "nightFeatures": [/* NightFeatureSet[] */],
  "sleepDetections": [/* SleepDetectionSummary[] */],
  "sleepStages": [/* SleepStageSummary[] */],     // REQUIRED — used by typicalRanges + journalCorrelations + computeSleepScoreForNight
  "baseline": {/* BaselineProfile */},
  "journalEntries": [/* JournalFactorEntry[] */],
  "targetSleepMinutes": 480,
  "dayDates": ["2026-05-14", "2026-05-15", ...],
  "timeZone": "Asia/Kolkata"
}

// Response: ComputeBatchResultV1
{
  "schemaVersion": 1,
  "derivedMetricsByDay": [
    { "dayDate": "2026-05-14", "metrics": { /* PersistedDailyMetricV1 */ } },
    ...
  ],
  "dailyScores": [/* DailyWellnessScore[] */],
  "sleepScoreByNightKey": { "1747084800000": 85, "1747171200000": null },
  "recomputedBaseline": { /* BaselineProfile */ },
  "typicalRanges": { /* SleepTypicalRanges or null */ },
  "journalCorrelations": [/* JournalSleepCorrelation[] */]
}
```

Field names + casing match the TS interfaces in `apps/backend/src/processing/interfaces.ts` exactly. **Caveat:** JSON-serialized `Date` fields come back as ISO-8601 strings, not JS `Date` objects. The NestJS client (`compute-engine-client.ts`) revives them via `new Date(s)` before returning to callers — see the `liftPersistedToBundle` helper in the implementation plan. The Zod schema accepts ISO-8601 strings and the lift function does the conversion.

---

## Fallback semantics (binding)

NestJS `compute-engine-client.ts` MUST implement these rules. **Single source of truth — these supersede any earlier inline mention.**

1. **Feature flag check.** If `COMPUTE_ENGINE_ENABLED !== 'true'`, never call Rust. Run JS path. (Not a fallback — never attempted.)
2. **Hard timeout.** Per-request timeout 30s for Phase 1 (one day), 120s for Phase 2 (batch). On timeout → fallback, reason `timeout`.
3. **Status check.** Fallback on:
   - Network error (DNS, connection refused, TCP reset) → reason `network`
   - Any `5xx` → reason `server_error`
   - `401` / `403` → reason `auth_error` (also pages on-call separately — should not happen in steady state)
   - `400` → reason `bad_request` (also pages on-call separately — schema drift)
   - `404` → reason `not_found` (also pages on-call separately)
   - Other `4xx` → reason `client_error`
4. **Parse check.** Response body fails `JSON.parse`, or fails Zod schema validation, or `schemaVersion !== 1` → fallback, reason `malformed_response`.
5. **Numeric sanity check.** If any field violates: `strainScore` not in `[0, 21]` (or null), `recoveryIndex` not in `[0, 100]` (or null), any `NaN`/`Infinity` → fallback, reason `bad_numeric`. (Phase 1 + Phase 2.)
6. **Per-run fallback policy:**
   - **Phase 1 (per-day calls):** keep falling back to JS for the remainder of the run once we've fallen back for any single day. Don't retry Rust mid-run. Persisted result is a mix of Rust+JS up to the failure point, JS after. Documented in metadata.
   - **Phase 2 (single batch call):** all-or-JS. Any failure → entire compute stage runs in JS. No partial Rust results retained.
7. **Logging.** Every fallback emits a structured log line:
   ```
   { event: 'compute-engine-fallback', reason, userId, run_id, day, duration_ms, http_status, error_class }
   ```
8. **Metrics.** Cloud Monitoring counter `compute_fallback_total{reason}` and histogram `compute_engine_latency_seconds{outcome}` where `outcome ∈ {rust_ok, fallback_<reason>}`.
9. **Alerting.** Page on:
   - `auth_error` rate > 0 over 5 minutes (means IAM is broken)
   - `bad_request` / `malformed_response` rate > 0 over 5 minutes (means schema drift)
   - Total fallback rate > 5% over 30 minutes (means Rust is degraded)
10. **Server-side request deadline (best-effort).** Compute engine handlers honor a 25s deadline by:
    - racing the `spawn_blocking` join handle against a `tokio::time::sleep(25s)` and returning `503` if the deadline wins;
    - the blocking thread cannot be cancelled once started — it will run to completion in the background. With `--no-cpu-throttling` + `--concurrency=4` set, one stuck thread can starve up to one concurrent request slot until it finishes.
    - **Mitigation:** keep individual math functions short. If any function ever exceeds 10s on real fixtures, refactor to check a `should_abort` `AtomicBool` between phases. Not in initial scope; flagged as a known limitation.

---

## Validation strategy

Two layers, plus a CI parity check.

### Golden fixtures (Rust unit tests + JS round-trip)
- 5–10 fixtures committed under `apps/backend/.fixtures/compute-engine-golden/<date>-<user-hash>.json`.
- Each fixture = `{ input: ComputeDerivedMetricsDayRequestV1, expectedOutput: PersistedDailyMetricV1 }`.
- **Anonymization rules:**
  - Replace `userId` with deterministic hash (e.g. `user_a`, `user_b`).
  - Quantize timestamps to second precision and shift to a fixed epoch (e.g. all fixtures rebased to `2026-01-01T00:00:00Z` start).
  - Drop any free-text fields (`journalEntries.note` → empty string).
- **Edge cases that MUST be covered:**
  - DST-prone timezone (`America/New_York`, spring-forward / fall-back days)
  - Half-hour offset zone (`Asia/Kolkata`)
  - Nulls in every nullable field
  - Empty `sensorRecords` (HR-only fallback path)
  - Single sample (degenerate strain case)
  - `baseline.maxHeartRate = null` (fallback to 190 default)
- **Refresh cadence:** rebuild fixtures whenever JS intentionally changes math; PR must update fixtures in same commit and explain why in the commit message.
- Tests run in CI for both Rust (`cargo test golden_*`) and Node (`pnpm test compute-engine-fixtures`) — both sides must produce identical outputs from identical inputs.

### Live shadow mode (NestJS, Phase 1 only)
Optional `COMPUTE_ENGINE_SHADOW=true` env flag: pipeline runs BOTH paths, uses the JS result, compares against the Rust result, logs any field that differs by >1e-4. Off by default; flip on for a few days during Phase 1 validation. Disabled in Phase 2 and beyond — too expensive on batch.

### CI schema parity
A test in CI loads each golden fixture, runs `JSON.stringify` through both TS-zod-validated and Rust-serde-deserialized paths, and asserts byte-identical re-serialization. Catches casing/naming drift between `compute-engine-types.ts` and `types.rs`.

---

## Observability

Logs (structured JSON via `tracing`):
- One log per request with `event`, `endpoint`, `run_id`, `day`, `duration_ms`, `payload_bytes`, `status`.
- One log per `serde_json` parse error.
- One log per panic (via `std::panic::set_hook` → `tracing::error!`).

Metrics (Cloud Monitoring, ingested from log-based metrics). **All metrics use a single consistent label set `{endpoint, outcome}` where `outcome ∈ {rust_ok, fallback_<reason>}`:**
- `compute_engine_requests_total{endpoint, outcome}` (counter, emitted by NestJS)
- `compute_engine_latency_seconds{endpoint, outcome}` (histogram, buckets `0.05, 0.1, 0.5, 1, 5, 30`, emitted by NestJS — captures total round-trip time including fallback)
- `compute_engine_payload_bytes{endpoint, direction}` (histogram, emitted by NestJS — `direction ∈ {request_gzipped, response}`)
- `compute_engine_panics_total{endpoint}` (counter, emitted by Rust via log-based metric)

Tracing:
- NestJS attaches a `run_id` (UUID) header `X-Run-Id`; Rust echoes it in logs.
- No `userId` in metric labels (cardinality + privacy). `userId` in logs only.

Alerts: see "Fallback semantics" rule 9.

---

## Deployment config

`gcloud run deploy noop-compute-engine \`:
- `--region=us-central1` (same as backend)
- `--memory=512Mi` (Phase 1; bump to 1Gi in Phase 2 if rayon needs it)
- `--cpu=2` (Phase 1; bump to 4 in Phase 2)
- `--cpu-boost` (faster cold start — Cloud Run gives the container ~2x CPU during startup)
- `--no-cpu-throttling` (so background work doesn't get throttled mid-request; needed because we use spawn_blocking)
- `--concurrency=4` (low; we want isolation since each request is CPU-heavy)
- `--max-instances=10` (Phase 1) / `--max-instances=50` (Phase 2)
- `--min-instances=1` (Phase 3 only — costs ~$15/month for a 1 vCPU keepalive, avoids cold starts in steady state)
- `--timeout=30` (Phase 1) / `--timeout=120` (Phase 2)
- `--no-allow-unauthenticated`
- `--service-account=noop-compute-engine@flashckard.iam.gserviceaccount.com`

IAM:
- Create SA `noop-compute-engine@flashckard.iam.gserviceaccount.com` with no roles (compute service needs no GCP API access).
- Grant `roles/run.invoker` on `noop-compute-engine` to backend's existing runtime SA `noop-cloud-run@flashckard.iam.gserviceaccount.com` (the one used in `.github/workflows/deploy-backend.yml:69`).

Billing mode: instance-based (default for Cloud Run gen2). Request-based saves money but causes per-request CPU ramp-up which hurts a CPU-bound service.

---

## File map

**New:**
- `apps/compute-engine/Cargo.toml`
- `apps/compute-engine/Cargo.lock`
- `apps/compute-engine/src/main.rs` — axum server entry
- `apps/compute-engine/src/types.rs` — `*V1` request/response structs
- `apps/compute-engine/src/math/mod.rs`
- `apps/compute-engine/src/math/strain.rs`
- `apps/compute-engine/src/math/hrv.rs`
- `apps/compute-engine/src/math/stress.rs`
- `apps/compute-engine/src/math/spo2.rs`
- `apps/compute-engine/src/math/skin_temp.rs`
- `apps/compute-engine/src/math/sleep_consistency.rs`
- `apps/compute-engine/src/math/recovery_index.rs`
- `apps/compute-engine/src/math/training_load.rs`
- `apps/compute-engine/src/math/core_temperature.rs`
- `apps/compute-engine/src/math/spo2_events.rs`
- `apps/compute-engine/src/derived_metrics.rs` — top-level per-day function
- `apps/compute-engine/src/handlers.rs` — axum routes
- `apps/compute-engine/src/calendar.rs` — TZ-aware day bounds
- `apps/compute-engine/Dockerfile`
- `apps/compute-engine/.dockerignore`
- `apps/compute-engine/tests/golden.rs`
- `apps/compute-engine/benches/derived_metrics.rs` — criterion benchmark
- `.github/workflows/deploy-compute-engine.yml`
- `apps/backend/src/pipeline/compute-engine-client.ts`
- `apps/backend/src/pipeline/compute-engine-types.ts` — TS mirror of Rust types
- `apps/backend/src/pipeline/compute-engine-types.spec.ts` — round-trip parity test
- `apps/backend/.fixtures/compute-engine-golden/*.json`
- `apps/backend/test/compute-engine-fixtures.spec.ts` — JS-side fixture parity

**Modify:**
- `apps/backend/src/pipeline/pipeline.service.ts` — wrap per-day compute loop in try/Rust-or-fallback dispatch. JS path untouched.
- `apps/backend/src/pipeline/pipeline.module.ts` — register the new client module.

**Touched but not refactored:**
- `apps/backend/src/processing/derived-metrics.ts` — stays exactly as-is. It IS the fallback.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Floating-point drift between JS and Rust (different summation order) | 1e-4 tolerance in golden tests. Larger diffs = bug. |
| Timezone edge case mismatches | `chrono-tz` mirrors `tzdb` used by Node `Intl`. Golden fixtures cover DST + half-hour zones. |
| Cold-start latency on Cloud Run | `--cpu-boost`, `--min-instances=1` in prod, `--no-cpu-throttling`. |
| 32 MiB payload limit | Gzip mandatory. Task 0 measures real size. If >16 MiB compressed, chunk per-day or switch to MessagePack. |
| JSON parse overhead grows with userbase | Monitored via `compute_engine_payload_bytes`. Switch to MessagePack if parse >10% of request time. |
| Rust service crash → all users see fallback | By design. JS path is the safety net. Cloud Run restarts the instance. |
| Tokio worker starvation under load | All compute runs on `spawn_blocking` / rayon, never on tokio workers. |
| Rust dependency vulnerabilities | `cargo-audit` step in CI. |
| Schema drift between TS and Rust | CI round-trip parity test on every fixture. |
| Golden fixture rot | PR template requires "did you update fixtures?" checkbox; commit message must explain math change. |
| IAM misconfigured → 403 in prod | `auth_error` fallback reason pages on-call immediately. |
| Fixture privacy / GDPR | Anonymization rules enforced by a lint script (`scripts/check-fixtures.ts`) that fails CI if `userId` or unhashed timestamps slip in. |

---

## Open questions

None. All design choices decided in conversation or via Codex feedback.

---

## What I need to build it

User has confirmed:
- JSON over HTTPS, not gRPC
- axum framework
- Phase 1 first; promote to Phase 2 after correctness parity + ≥5× local microbench
- JS path stays as fallback indefinitely

Ready for the writing-plans skill to produce `docs/superpowers/plans/2026-05-19-rust-compute-engine-phase-1.md`.
