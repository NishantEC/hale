# Rust Compute Engine — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Rust HTTP service (`noop-compute-engine`) on Cloud Run that takes one day's worth of pipeline inputs and returns the same `PersistedDailyMetricV1` scalars the JS `computeDerivedMetrics` produces, with golden-fixture parity and a ≥5× local function-level speedup. NestJS gains a client behind a feature flag with full fallback semantics; the JS path stays in place untouched.

**Architecture:** axum + tokio + serde service on Cloud Run, ID-token authenticated. Each request runs on a `spawn_blocking` thread. Payloads are gzipped JSON. NestJS calls the service per-day inside the existing pipeline loop. Phase 1 is per-day; the batch endpoint is Phase 2 (separate plan).

**Tech Stack:** Rust 1.85, axum 0.8, tokio 1.x, serde / serde_json, chrono + chrono-tz, tracing + tracing-subscriber, tower-http, criterion (benchmarks), Cloud Run gen2, Docker (debian-slim or distroless), GitHub Actions.

**Reference spec:** `docs/superpowers/specs/2026-05-19-rust-compute-engine-design.md`

---

## Task 0: Payload-size gate — verify gzipped 45-day request fits in 16 MiB

**Files:**
- Create: `apps/backend/src/scripts/measure-compute-payload.ts`

This task is the blocker check from the spec. If a real 45-day window encoded as gzipped JSON is larger than 16 MiB, the Phase 1 plan needs to switch to chunked-by-day or MessagePack before any other work happens.

- [ ] **Step 1: Write the measurement script**

```ts
// apps/backend/src/scripts/measure-compute-payload.ts
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { gzipSync } from 'zlib';

async function main() {
  const userId = process.argv[2];
  if (!userId) throw new Error('usage: measure-compute-payload <userId>');
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: parseInt(process.env.DB_PORT ?? '5433', 10),
    username: process.env.DB_USER ?? 'noop',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME ?? 'noop',
    entities: [],
    synchronize: false,
  });
  await ds.initialize();
  const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const [samples, sensorRecords, nightFeatures, sleepDetections, baseline] = await Promise.all([
    ds.query('SELECT * FROM signal_samples WHERE "userId"=$1 AND "timestamp" >= $2', [userId, since]),
    ds.query('SELECT * FROM raw_sensor_records WHERE "userId"=$1 AND "timestamp" >= $2', [userId, since]),
    ds.query('SELECT * FROM night_features WHERE "userId"=$1 AND "nightDate" >= $2', [userId, since]),
    ds.query('SELECT * FROM sleep_detections WHERE "userId"=$1 AND "nightDate" >= $2', [userId, since]),
    ds.query('SELECT * FROM baseline_profiles WHERE "userId"=$1 LIMIT 1', [userId]),
  ]);
  // Measure BOTH the Phase 1 day payload (no sleepStages, no journal)
  // and the Phase 2 batch payload (includes both). Phase 2 is the one
  // that could blow the 32 MiB limit; we want a real number now.
  const [sleepStages, journalEntries] = await Promise.all([
    ds.query('SELECT * FROM sleep_stages WHERE "userId"=$1 AND "nightDate" >= $2', [userId, since]),
    ds.query('SELECT * FROM journal_entries WHERE "userId"=$1 AND "timestamp" >= $2', [userId, since]),
  ]);
  const phase1Payload = {
    schemaVersion: 1, samples, sensorRecords, nightFeatures, sleepDetections,
    baseline: baseline[0] ?? null,
    referenceDate: new Date().toISOString().slice(0, 10),
    timeZone: 'Asia/Kolkata',
  };
  const phase2Payload = {
    schemaVersion: 1, samples, sensorRecords, nightFeatures, sleepDetections, sleepStages,
    baseline: baseline[0] ?? null, journalEntries, targetSleepMinutes: 480,
    dayDates: Array.from({ length: 45 }, (_, i) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)),
    timeZone: 'Asia/Kolkata',
  };
  const measure = (label: string, p: unknown) => {
    const raw = Buffer.from(JSON.stringify(p));
    const gz = gzipSync(raw, { level: 6 });
    return { label, samples: samples.length, sensorRecords: sensorRecords.length, rawMiB: +(raw.length / 1024 / 1024).toFixed(2), gzipMiB: +(gz.length / 1024 / 1024).toFixed(2) };
  };
  console.log(JSON.stringify([measure('phase1-day', phase1Payload), measure('phase2-batch', phase2Payload)], null, 2));
  await ds.destroy();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run against prod (read-only) via cloud-sql-proxy**

```
cloud-sql-proxy --port 5433 flashckard:us-central1:noop-db &
DB_USER=noop DB_PORT=5433 DB_HOST=127.0.0.1 \
  DB_PASSWORD="$(gcloud secrets versions access latest --secret=NOOP_DB_PASSWORD --project=flashckard)" \
  npx tsx apps/backend/src/scripts/measure-compute-payload.ts <real-user-uuid>
```

Expected output: JSON array with two entries (phase1-day, phase2-batch). **Gates:**
- `phase1-day.gzipMiB < 4.0` — Phase 1 sends full multi-day inputs per day; this MUST fit comfortably.
- `phase2-batch.gzipMiB < 16.0` — Phase 2 hard gate.

If `phase1-day` > 4 MiB, look at whether the day-call needs to ship the full window (it does — rolling-window math). If `phase2-batch` > 16 MiB, stop and revise the spec to chunk-by-day or switch to MessagePack before continuing.

- [ ] **Step 3: Commit the script + measurement result**

```
git add apps/backend/src/scripts/measure-compute-payload.ts
git commit -m "rust-compute: payload-size measurement script + 45d baseline" 
```

Append a sentence to the spec under "Payload budget" with the actual measured MiB.

---

## Task 0.5: Add NestJS dependencies

**Files:**
- Modify: `apps/backend/package.json`
- Modify: `pnpm-lock.yaml` (auto)

The plan introduces three packages that aren't currently dependencies of the backend.

- [ ] **Step 1: Install**

```
cd apps/backend
pnpm add zod google-auth-library
pnpm add -D nock @types/nock
```

- [ ] **Step 2: Verify TypeScript still builds**

```
pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git add apps/backend/package.json pnpm-lock.yaml
git commit -m "backend: add zod, google-auth-library, nock for compute-engine client"
```

---

## Task 1: Cargo crate scaffold

**Files:**
- Create: `apps/compute-engine/Cargo.toml`
- Create: `apps/compute-engine/src/main.rs`
- Create: `apps/compute-engine/.gitignore`
- Create: `apps/compute-engine/rust-toolchain.toml`

- [ ] **Step 1: Init the crate**

```
mkdir -p apps/compute-engine/src
cd apps/compute-engine
cat > Cargo.toml <<'EOF'
[package]
name = "noop-compute-engine"
version = "0.1.0"
edition = "2024"
rust-version = "1.85"

[dependencies]
axum = "0.8"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "signal"] }
tower = "0.5"
tower-http = { version = "0.6", features = ["compression-gzip", "decompression-gzip", "trace"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
chrono = { version = "0.4", features = ["serde"] }
chrono-tz = "0.10"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["json", "env-filter"] }
thiserror = "2"

[dev-dependencies]
criterion = "0.5"
pretty_assertions = "1"
reqwest = { version = "0.12", features = ["json", "gzip"] }

[profile.release]
opt-level = 3
lto = "fat"
codegen-units = 1
EOF
echo '[toolchain]
channel = "1.85.0"
components = ["rustfmt", "clippy"]' > rust-toolchain.toml
echo 'target/' > .gitignore
```

Note: the `[[bench]]` target is added later in Task 22 (with the bench file). Adding it now would break `cargo build`. **Commit `Cargo.lock`** — this is a binary, not a library. Reproducible deploy depends on it.

- [ ] **Step 2: Write a hello-world main**

```rust
// apps/compute-engine/src/main.rs
use axum::{routing::get, Router};
use std::net::SocketAddr;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt().json().init();
    let app = Router::new().route("/healthz", get(|| async { "ok" }));
    let port: u16 = std::env::var("PORT").ok().and_then(|s| s.parse().ok()).unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(%addr, "compute-engine listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
```

- [ ] **Step 3: Build + smoke test**

```
cargo build --release
target/release/noop-compute-engine &
SERVER_PID=$!
sleep 0.5
curl -fsS http://localhost:8080/healthz
kill $SERVER_PID
```

Expected: `ok`. Test passes if curl exits 0 and prints `ok`.

- [ ] **Step 4: Commit**

```
cd /Users/nish/Documents/noop
git add apps/compute-engine
git commit -m "compute-engine: scaffold axum service with /healthz"
```

---

## Task 2: Versioned type definitions (TS source of truth + Rust mirror + round-trip parity test)

**Files:**
- Create: `apps/backend/src/pipeline/compute-engine-types.ts`
- Create: `apps/backend/src/pipeline/compute-engine-types.spec.ts`
- Create: `apps/compute-engine/src/types.rs`

The TS file is the source of truth (mirrors `apps/backend/src/processing/interfaces.ts` with `schemaVersion: 1` wrapping). The Rust mirror uses `serde` derives with `#[serde(rename_all = "camelCase")]`. CI parity test ensures byte-identical re-serialization.

- [ ] **Step 1: Write the TS types + zod validator**

```ts
// apps/backend/src/pipeline/compute-engine-types.ts
import { z } from 'zod';

export const SignalSampleSchema = z.object({
  timestamp: z.string().datetime(),     // ISO-8601, parsed back to Date by client
  source: z.string(),
  heartRate: z.number(),
  ibiMs: z.number().nullable(),
  motionScore: z.number().nullable(),
  qualityScore: z.number(),
});

// ... mirror every interface from interfaces.ts ...
// (HistoricalSensorRecord, NightFeatureSet, SleepDetectionSummary, BaselineProfile)

export const ComputeDerivedMetricsDayRequestV1Schema = z.object({
  schemaVersion: z.literal(1),
  samples: z.array(SignalSampleSchema),
  sensorRecords: z.array(HistoricalSensorRecordSchema),
  nightFeatures: z.array(NightFeatureSetSchema),
  sleepDetections: z.array(SleepDetectionSummarySchema),
  baseline: BaselineProfileSchema,
  referenceDate: z.string(),            // YYYY-MM-DD
  timeZone: z.string(),
});

export const PersistedDailyMetricV1Schema = z.object({
  schemaVersion: z.literal(1),
  strainScore: z.number().nullable(),
  sleepConsistencyScore: z.number().nullable(),
  detectedSleepNights: z.number(),
  skinTempAvgCelsius: z.number().nullable(),
  skinTempDeltaCelsius: z.number().nullable(),
  stressAverage: z.number().nullable(),
  spo2Average: z.number().nullable(),
  lfHfRatioAverage: z.number().nullable(),
  recoveryIndex: z.number().nullable(),
  trainingLoadRatio: z.number().nullable(),
  trainingLoadRiskZone: z.string().nullable(),
  spo2DipCount: z.number().nullable(),
  odiPerHour: z.number().nullable(),
  lowestSpo2: z.number().nullable(),
  coreTemperatureEstimate: z.number().nullable(),
  circadianNadir: z.string().datetime().nullable(),
  sleepArchitectureScore: z.number().nullable(),
});

export type ComputeDerivedMetricsDayRequestV1 = z.infer<typeof ComputeDerivedMetricsDayRequestV1Schema>;
export type PersistedDailyMetricV1 = z.infer<typeof PersistedDailyMetricV1Schema>;
```

- [ ] **Step 2: Write the Rust mirror**

```rust
// apps/compute-engine/src/types.rs
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalSample {
    pub timestamp: DateTime<Utc>,
    pub source: String,
    pub heart_rate: f64,
    pub ibi_ms: Option<f64>,
    pub motion_score: Option<f64>,
    pub quality_score: f64,
}

// ... mirror every type ...
// IMPORTANT: every Option<T> in Rust corresponds to a `T | null` in TS.
// IMPORTANT: chrono parses ISO-8601 with `Z` suffix natively.

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputeDerivedMetricsDayRequestV1 {
    pub schema_version: u32,            // must equal 1; validated in handler
    pub samples: Vec<SignalSample>,
    pub sensor_records: Vec<HistoricalSensorRecord>,
    pub night_features: Vec<NightFeatureSet>,
    pub sleep_detections: Vec<SleepDetectionSummary>,
    pub baseline: BaselineProfile,
    pub reference_date: String,         // YYYY-MM-DD
    pub time_zone: String,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PersistedDailyMetricV1 {
    pub schema_version: u32,            // always 1
    pub strain_score: Option<f64>,
    pub sleep_consistency_score: Option<f64>,
    pub detected_sleep_nights: u32,
    pub skin_temp_avg_celsius: Option<f64>,
    pub skin_temp_delta_celsius: Option<f64>,
    pub stress_average: Option<f64>,
    pub spo2_average: Option<f64>,
    pub lf_hf_ratio_average: Option<f64>,
    pub recovery_index: Option<f64>,
    pub training_load_ratio: Option<f64>,
    pub training_load_risk_zone: Option<String>,
    pub spo2_dip_count: Option<u32>,
    pub odi_per_hour: Option<f64>,
    pub lowest_spo2: Option<f64>,
    pub core_temperature_estimate: Option<f64>,
    pub circadian_nadir: Option<DateTime<Utc>>,
    pub sleep_architecture_score: Option<f64>,
}
```

- [ ] **Step 3: Write the parity test (Jest, TS side)**

The test must compare semantically, not byte-for-byte: `chrono` may drop trailing-zero milliseconds (`...:00.000Z` → `...:00Z`) and serde may re-order Option fields. Use Zod-parsed object equality on both sides.

```ts
// apps/backend/src/pipeline/compute-engine-types.spec.ts
import { ComputeDerivedMetricsDayRequestV1Schema } from './compute-engine-types';
import { execFileSync } from 'child_process';
import { writeFileSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('compute-engine types parity', () => {
  it('round-trips a sample request through Rust deserialize -> serialize', () => {
    const sample = {
      schemaVersion: 1 as const,
      samples: [{ timestamp: '2026-05-18T05:00:00.000Z', source: 'strap-history', heartRate: 78, ibiMs: 769, motionScore: null, qualityScore: 1 }],
      sensorRecords: [], nightFeatures: [], sleepDetections: [],
      baseline: { restingHeartRate: 57, rmssd: 58, sdnn: 65, nightsUsed: 9, isWarmedUp: true, maxHeartRate: 190 },
      referenceDate: '2026-05-18',
      timeZone: 'Asia/Kolkata',
    };
    const dir = mkdtempSync(join(tmpdir(), 'parity-'));
    writeFileSync(join(dir, 'input.json'), JSON.stringify(sample));
    const out = execFileSync(
      'cargo', ['run', '--release', '--quiet', '--bin', 'parity', '--', join(dir, 'input.json')],
      { cwd: join(__dirname, '../../../compute-engine'), encoding: 'utf8' },
    );
    const rustParsed = JSON.parse(out);
    // Parse both sides through Zod to normalize timestamp formatting + drop unknown keys.
    const expected = ComputeDerivedMetricsDayRequestV1Schema.parse(sample);
    const actual = ComputeDerivedMetricsDayRequestV1Schema.parse(rustParsed);
    // Normalize timestamps by re-parsing through Date to absorb '.000Z' vs 'Z' diffs.
    const normalizeTs = (o: any) => JSON.parse(JSON.stringify(o), (_k, v) => {
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toISOString();
      return v;
    });
    expect(normalizeTs(actual)).toEqual(normalizeTs(expected));
  });
});
```

- [ ] **Step 4: Write the Rust `parity` bin**

```rust
// apps/compute-engine/src/bin/parity.rs
use noop_compute_engine::types::ComputeDerivedMetricsDayRequestV1;
use std::{env, fs};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = env::args().nth(1).expect("usage: parity <input.json>");
    let raw = fs::read_to_string(path)?;
    let parsed: ComputeDerivedMetricsDayRequestV1 = serde_json::from_str(&raw)?;
    let re = serde_json::to_string(&parsed)?;
    print!("{re}");
    Ok(())
}
```

Add `pub mod types;` to `src/lib.rs` and add `[lib] name = "noop_compute_engine"` to Cargo.toml.

- [ ] **Step 5: Run the parity test**

```
cd apps/compute-engine && cargo build --release --bin parity && cd -
cd apps/backend && pnpm test compute-engine-types.spec
```

Expected: pass.

- [ ] **Step 6: Commit**

```
git add apps/backend/src/pipeline/compute-engine-types.ts apps/backend/src/pipeline/compute-engine-types.spec.ts apps/compute-engine/src/types.rs apps/compute-engine/src/lib.rs apps/compute-engine/src/bin/parity.rs apps/compute-engine/Cargo.toml
git commit -m "compute-engine: V1 types in TS + Rust with CI parity test"
```

---

## Task 3: Golden fixture capture script

**Files:**
- Create: `apps/backend/src/scripts/capture-compute-golden.ts`
- Create: `apps/backend/.fixtures/compute-engine-golden/.gitkeep`
- Create: `apps/backend/scripts/check-fixtures.ts` (anonymization lint)

The script reads one user's prod data for one day, anonymizes it per spec rules, runs JS `computeDerivedMetrics` to produce the expected output, and writes both to a fixture file.

- [ ] **Step 1: Write the capture script**

```ts
// apps/backend/src/scripts/capture-compute-golden.ts
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { computeDerivedMetrics, precomputeMetricSeries } from '../processing/derived-metrics';
import { writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

const FIXTURE_DIR = join(__dirname, '../../.fixtures/compute-engine-golden');
const EPOCH = new Date('2026-01-01T00:00:00.000Z').getTime();

async function main() {
  const [userId, day, tag, tzArg] = process.argv.slice(2);
  if (!userId || !day) throw new Error('usage: capture-compute-golden <userId> <YYYY-MM-DD> <tag> [tz]');
  const timeZone = tzArg ?? 'Asia/Kolkata';

  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: parseInt(process.env.DB_PORT ?? '5433', 10),
    username: process.env.DB_USER ?? 'noop',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME ?? 'noop',
    entities: [],
    synchronize: false,
  });
  await ds.initialize();

  const dayDate = new Date(`${day}T00:00:00Z`);
  // computeDerivedMetrics needs 7+ days of history for rolling windows.
  const since = new Date(dayDate.getTime() - 8 * 86400000);
  const until = new Date(dayDate.getTime() + 1 * 86400000);

  const [samples, sensorRecords, nightFeatures, sleepDetections, baseline] = await Promise.all([
    ds.query('SELECT * FROM signal_samples WHERE "userId"=$1 AND "timestamp" >= $2 AND "timestamp" < $3 ORDER BY "timestamp"', [userId, since, until]),
    ds.query('SELECT * FROM raw_sensor_records WHERE "userId"=$1 AND "timestamp" >= $2 AND "timestamp" < $3 ORDER BY "timestamp"', [userId, since, until]),
    ds.query('SELECT * FROM night_features WHERE "userId"=$1 AND "nightDate" >= $2 AND "nightDate" < $3', [userId, since, until]),
    ds.query('SELECT * FROM sleep_detections WHERE "userId"=$1 AND "nightDate" >= $2 AND "nightDate" < $3', [userId, since, until]),
    ds.query('SELECT * FROM baseline_profiles WHERE "userId"=$1 LIMIT 1', [userId]),
  ]);

  // Anonymization: shift all timestamps so the captured day starts at EPOCH.
  const shiftMs = EPOCH - dayDate.getTime();
  const userHash = `user_${createHash('sha256').update(userId).digest('hex').slice(0, 8)}`;
  const shiftTs = <T extends { timestamp?: any; nightDate?: any; bedtime?: any; wakeTime?: any }>(row: T): T => {
    const out: any = { ...row };
    for (const k of ['timestamp', 'nightDate', 'bedtime', 'wakeTime']) {
      if (out[k]) out[k] = new Date(new Date(out[k]).getTime() + shiftMs).toISOString();
    }
    delete out.userId;
    delete out.id;
    return out;
  };
  const anonSamples = samples.map(shiftTs);
  const anonSensor = sensorRecords.map(shiftTs);
  const anonFeatures = nightFeatures.map(shiftTs);
  const anonDetections = sleepDetections.map(shiftTs);
  const anonBaseline = baseline[0] ? (({ userId: _u, id: _i, ...rest }: any) => rest)(baseline[0]) : null;

  // Run JS to get the expected output. We use the SHIFTED inputs so the
  // fixture is fully self-contained; the date passed must also be shifted.
  const shiftedDay = new Date(EPOCH).toISOString().slice(0, 10);
  const samplesD = anonSamples.map((s: any) => ({ ...s, timestamp: new Date(s.timestamp) }));
  const sensorD = anonSensor.map((s: any) => ({ ...s, timestamp: new Date(s.timestamp) }));
  const featuresD = anonFeatures.map((f: any) => ({ ...f, nightDate: new Date(f.nightDate) }));
  const detD = anonDetections.map((d: any) => ({ ...d, nightDate: new Date(d.nightDate), bedtime: new Date(d.bedtime), wakeTime: new Date(d.wakeTime) }));
  const precomputed = precomputeMetricSeries(samplesD, sensorD);
  const expected = computeDerivedMetrics(samplesD, sensorD, featuresD, detD, anonBaseline ?? { restingHeartRate: 0, rmssd: 0, sdnn: 0, nightsUsed: 0, isWarmedUp: false, maxHeartRate: null }, new Date(shiftedDay), timeZone, precomputed);

  const fixture = {
    description: tag,
    input: {
      schemaVersion: 1,
      samples: anonSamples, sensorRecords: anonSensor, nightFeatures: anonFeatures, sleepDetections: anonDetections,
      baseline: anonBaseline ?? { restingHeartRate: 0, rmssd: 0, sdnn: 0, nightsUsed: 0, isWarmedUp: false, maxHeartRate: null },
      referenceDate: shiftedDay,
      timeZone,
    },
    expected: {
      schemaVersion: 1,
      strainScore: expected.strainScore,
      sleepConsistencyScore: expected.sleepConsistencyScore,
      detectedSleepNights: expected.detectedSleepNights,
      skinTempAvgCelsius: expected.skinTempAvgCelsius,
      skinTempDeltaCelsius: expected.skinTempDeltaCelsius,
      stressAverage: expected.stressAverage,
      spo2Average: expected.spo2Average,
      lfHfRatioAverage: expected.lfHfRatioAverage,
      recoveryIndex: expected.recoveryIndex,
      trainingLoadRatio: expected.trainingLoadRatio,
      trainingLoadRiskZone: expected.trainingLoadRiskZone,
      spo2DipCount: expected.spo2DipCount,
      odiPerHour: expected.odiPerHour,
      lowestSpo2: expected.lowestSpo2,
      coreTemperatureEstimate: expected.coreTemperatureEstimate,
      circadianNadir: expected.circadianNadir,
      sleepArchitectureScore: expected.sleepArchitectureScore,
    },
  };
  writeFileSync(join(FIXTURE_DIR, `${tag}.json`), JSON.stringify(fixture, null, 2));
  console.log(`wrote ${tag}.json — userHash=${userHash}`);
  await ds.destroy();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Write the anonymization lint**

```ts
// apps/backend/scripts/check-fixtures.ts
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
const DIR = join(__dirname, '../.fixtures/compute-engine-golden');
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
let failed = false;
for (const f of readdirSync(DIR).filter((x) => x.endsWith('.json'))) {
  const text = readFileSync(join(DIR, f), 'utf8');
  if (UUID.test(text)) { console.error(`${f}: contains UUID`); failed = true; }
  if (/"note":\s*"[^"]+"/.test(text)) { console.error(`${f}: non-empty journal note`); failed = true; }
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 3: Capture 7 fixtures**

```
# Run against prod (read-only). Each: <userId> <day> <tag> [tz]
npx tsx apps/backend/src/scripts/capture-compute-golden.ts <uid-A> 2026-05-15 normal-ist
npx tsx apps/backend/src/scripts/capture-compute-golden.ts <uid-A> 2026-03-08 dst-spring America/New_York
npx tsx apps/backend/src/scripts/capture-compute-golden.ts <uid-A> 2025-11-02 dst-fall America/New_York
npx tsx apps/backend/src/scripts/capture-compute-golden.ts <uid-A> 2026-05-15 half-hour-tz Asia/Kolkata
npx tsx apps/backend/src/scripts/capture-compute-golden.ts <uid-B> <day-with-hr-only> empty-sensors
npx tsx apps/backend/src/scripts/capture-compute-golden.ts <uid-C> <day-with-1-sample> single-sample
# After: hand-edit one fixture and set `input.baseline.maxHeartRate = null` to cover the 190.0 fallback path.
cp apps/backend/.fixtures/compute-engine-golden/normal-ist.json apps/backend/.fixtures/compute-engine-golden/null-max-hr.json
# Then edit null-max-hr.json: set baseline.maxHeartRate = null and re-run computeDerivedMetrics to refresh `expected`.
npx tsx -e 'const f = require("./apps/backend/.fixtures/compute-engine-golden/null-max-hr.json"); f.input.baseline.maxHeartRate = null; require("fs").writeFileSync("apps/backend/.fixtures/compute-engine-golden/null-max-hr.json", JSON.stringify(f, null, 2));'
npx tsx apps/backend/src/scripts/refresh-fixture-expected.ts null-max-hr
```

A small helper `refresh-fixture-expected.ts` should be written alongside `capture-compute-golden.ts` — same JS run path, but it reads `input` from disk instead of querying prod. Add it as Step 3a.

Coverage matrix to verify (eyeball each generated fixture):
- `normal-ist` — full strap coverage, non-null in every nullable field
- `dst-spring` / `dst-fall` — calendar-bound math must not double-count or skip an hour
- `half-hour-tz` — UTC+5:30 day key
- `empty-sensors` — sensorRecords.length === 0 → spo2/skinTemp series empty, lowestSpo2 null
- `single-sample` — strainScore must be null (less-than-2 samples branch)
- `null-max-hr` — strain uses 190.0 fallback

- [ ] **Step 4: Run lint, commit**

```
npx tsx apps/backend/scripts/check-fixtures.ts
git add apps/backend/.fixtures/compute-engine-golden/*.json apps/backend/scripts/check-fixtures.ts apps/backend/src/scripts/capture-compute-golden.ts
git commit -m "compute-engine: 6 golden fixtures + anonymization lint"
```

Add the lint to backend's `package.json` `lint` script and to CI.

---

## Task 4: Calendar utilities — port `calendarDayKey` and `calendarDayBounds`

**Files:**
- Create: `apps/compute-engine/src/calendar.rs`
- Create: `apps/compute-engine/tests/calendar.rs`

These mirror `apps/backend/src/common/calendar.ts`. They take a `DateTime<Utc>` + IANA timezone string and return UTC instants for the calendar-day start/end in that timezone.

- [ ] **Step 1: Write the test fixture (JS-computed reference)**

Capture day-bounds for 3 (date, tz) pairs by running them through `calendarDayBounds` in a one-off Node script and writing the results to `apps/compute-engine/tests/fixtures/calendar.json`:
```json
[
  { "iso": "2026-05-18T18:30:00Z", "tz": "Asia/Kolkata", "key": "2026-05-19", "start": "2026-05-18T18:30:00Z", "end": "2026-05-19T18:30:00Z" },
  { "iso": "2026-03-08T07:30:00Z", "tz": "America/New_York", "key": "2026-03-08", "start": "2026-03-08T05:00:00Z", "end": "2026-03-09T04:00:00Z" },
  { "iso": "2026-11-01T05:30:00Z", "tz": "America/New_York", "key": "2026-11-01", "start": "2026-11-01T04:00:00Z", "end": "2026-11-02T05:00:00Z" }
]
```

- [ ] **Step 2: Write the failing Rust test**

```rust
// apps/compute-engine/tests/calendar.rs
use noop_compute_engine::calendar::{calendar_day_key, calendar_day_bounds};
use chrono::DateTime;

#[derive(serde::Deserialize)]
struct Case { iso: String, tz: String, key: String, start: String, end: String }

#[test]
fn matches_js_calendar_bounds() {
    let cases: Vec<Case> = serde_json::from_str(include_str!("fixtures/calendar.json")).unwrap();
    for c in &cases {
        let ts: DateTime<chrono::Utc> = c.iso.parse().unwrap();
        let key = calendar_day_key(ts, &c.tz);
        let (start, end) = calendar_day_bounds(&key, &c.tz);
        assert_eq!(key, c.key, "key for {} {}", c.iso, c.tz);
        assert_eq!(start.to_rfc3339_opts(chrono::SecondsFormat::Secs, true), c.start);
        assert_eq!(end.to_rfc3339_opts(chrono::SecondsFormat::Secs, true), c.end);
    }
}
```

- [ ] **Step 3: Run test to verify it fails**

```
cd apps/compute-engine && cargo test --test calendar
```

Expected: compile error (functions don't exist yet).

- [ ] **Step 4: Implement calendar.rs**

Port `apps/backend/src/common/calendar.ts`:
- `calendar_day_key(ts: DateTime<Utc>, tz: &str) -> String` — return `YYYY-MM-DD` in the given timezone via `ts.with_timezone(&tz.parse::<Tz>())`, formatted with `format("%Y-%m-%d")`.
- `calendar_day_bounds(key: &str, tz: &str) -> (DateTime<Utc>, DateTime<Utc>)` — parse `YYYY-MM-DD`, construct `NaiveDateTime` for midnight, localize via `tz.from_local_datetime`, convert to UTC. End is start of next day.
- `add_days_to_date_key(key: &str, days: i32) -> String` — parse, add, reformat.

- [ ] **Step 5: Run test, commit**

```
cargo test --test calendar
git add apps/compute-engine/src/calendar.rs apps/compute-engine/tests/calendar.rs apps/compute-engine/tests/fixtures/calendar.json
git commit -m "compute-engine: calendar utilities with cross-language fixtures"
```

---

## Task 5: Math primitives — `average`, `standardDeviation`, `clamp`, `averageByTimestamp`, `sliceByTimestamp`

**Files:**
- Create: `apps/compute-engine/src/math/mod.rs`
- Create: `apps/compute-engine/src/math/util.rs`
- Create: `apps/compute-engine/src/math/timestamp_slice.rs`

- [ ] **Step 1: Write the test**

```rust
// apps/compute-engine/src/math/util.rs
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn average_empty() { assert_eq!(average(&[]), 0.0); }
    #[test] fn average_basic() { assert!((average(&[1.0, 2.0, 3.0]) - 2.0).abs() < 1e-12); }
    #[test] fn std_dev_basic() { assert!((std_dev(&[1.0, 2.0, 3.0]) - (2.0_f64 / 3.0).sqrt()).abs() < 1e-12); }
    #[test] fn clamp_basic() { assert_eq!(clamp(5.0, 0.0, 3.0), 3.0); }
}
```

- [ ] **Step 2: Implement**

Port `apps/backend/src/processing/utils.ts` and `apps/backend/src/processing/timestamp-slice.ts`. Notably:
- JS `average` returns 0 for empty array — keep that quirk.
- `std_dev` uses population variance (divides by N, not N-1) — match JS.
- `sliceByTimestamp` uses two binary searches on a sorted slice; expose as a function returning `&[T]` from a `Vec<T>` and `start: DateTime<Utc>`, `end: DateTime<Utc>`.

- [ ] **Step 3: Run test, commit**

```
cargo test math::
git add apps/compute-engine/src/math/
git commit -m "compute-engine: math primitives (average, std_dev, clamp, slice)"
```

---

## Task 6: Port stress series — `stressPoints` + `baevskyStressScore`

**Files:**
- Create: `apps/compute-engine/src/math/stress.rs`

Source: `apps/backend/src/processing/derived-metrics.ts:268-331`. Window size 120, step 30, Baevsky stress formula with binned RR histogram.

- [ ] **Step 1: Add a golden mini-fixture**

Create `apps/compute-engine/tests/fixtures/stress.json` with 200 sorted (timestamp, ibiMs) entries and the JS-computed `stressPoints` output. Generate by extending `capture-compute-golden.ts` to optionally dump just stress.

- [ ] **Step 2: Write the failing test**

```rust
// apps/compute-engine/tests/math_stress.rs
use noop_compute_engine::math::stress::stress_points;
use noop_compute_engine::types::SignalSample;
// ... load fixture, call stress_points(&samples), assert each point within 1e-9 ...
```

- [ ] **Step 3: Implement `stress_points`**

Port the function, preserving:
- Sort order (ascending by timestamp)
- Window slicing semantics (`start <= len - windowSize`, step += 30)
- RR fallback: prefer `ibi_ms`, fall back to `60_000 / heart_rate`
- Bin width 50, mode bin selection, score formula matching JS line-for-line
- `Math.min(2000, Math.max(250, v))` → `v.clamp(250.0, 2000.0)`
- Output `value` rounded to 2 decimal places (`(score * 100.0).round() / 100.0`)

- [ ] **Step 4: Run test, commit**

```
cargo test --test math_stress
git add apps/compute-engine/src/math/stress.rs apps/compute-engine/tests/math_stress.rs apps/compute-engine/tests/fixtures/stress.json
git commit -m "compute-engine: port stress points (Baevsky) with golden test"
```

---

## Task 7: Port spo2 series — `spo2Points`

**Files:**
- Create: `apps/compute-engine/src/math/spo2.rs`

Source: `apps/backend/src/processing/derived-metrics.ts:335-366`. Window 30, step 15. AC/DC ratio of red vs IR.

- [ ] **Step 1: Add fixture** `apps/compute-engine/tests/fixtures/spo2.json` (sensor samples + expected output)
- [ ] **Step 2: Write failing test** mirroring Task 6 pattern
- [ ] **Step 3: Implement** — note: `acRed / meanRed` uses population stddev; result clamped to `[70, 100]`.
- [ ] **Step 4: Run test, commit**

```
cargo test --test math_spo2
git add apps/compute-engine/src/math/spo2.rs apps/compute-engine/tests/math_spo2.rs apps/compute-engine/tests/fixtures/spo2.json
git commit -m "compute-engine: port spo2 points with golden test"
```

---

## Task 8: Port skin temperature series — `skinTemperaturePoints`

**Files:**
- Create: `apps/compute-engine/src/math/skin_temp.rs`

Source: `derived-metrics.ts:370-378`. Filter `skinTempRaw >= 100`, convert via `* 0.04`, sort.

- [ ] **Step 1: Add fixture** `apps/compute-engine/tests/fixtures/skin_temp.json`
- [ ] **Step 2: Write failing test**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Commit**

```
git add apps/compute-engine/src/math/skin_temp.rs apps/compute-engine/tests/math_skin_temp.rs apps/compute-engine/tests/fixtures/skin_temp.json
git commit -m "compute-engine: port skin-temp points with golden test"
```

---

## Task 9: Port rolling RMSSD — `rollingRmssd`

**Files:**
- Create: `apps/compute-engine/src/math/hrv.rs`

Source: `derived-metrics.ts:227-264`. Window 300, step 30, artifact filter (reject diffs >20%), min 30 clean IBIs, midpoint timestamp.

- [ ] **Step 1: Add fixture** `apps/compute-engine/tests/fixtures/rolling_rmssd.json` with 1200 IBI samples + expected
- [ ] **Step 2: Write failing test**
- [ ] **Step 3: Implement** — note: midpoint = `windowSlice[floor(windowSlice.length / 2)].timestamp`, NOT median.
- [ ] **Step 4: Commit**

```
git add apps/compute-engine/src/math/hrv.rs apps/compute-engine/tests/math_hrv.rs apps/compute-engine/tests/fixtures/rolling_rmssd.json
git commit -m "compute-engine: port rolling RMSSD with golden test"
```

---

## Task 10: Port strain / TRIMP — `strainScore`

**Files:**
- Create: `apps/compute-engine/src/math/strain.rs`

Source: `derived-metrics.ts:382-456`. WHOOP-style TRIMP with Edwards' HR zone weights.

- [ ] **Step 1: Add fixture** `apps/compute-engine/tests/fixtures/strain.json` covering: normal day, low coverage (<10 min → null), single sample (null), max-HR=null fallback to 190.
- [ ] **Step 2: Write failing test**
- [ ] **Step 3: Implement** — constants `STRAIN_LN_7201 = 8.882_643_961_783_384`, zone weights 0/1/2/3/4/5 at 50/60/70/80/90, clamp dt to `[1/60, 5]` minutes, fallback `medianInterval / 60` for last sample.
- [ ] **Step 4: Commit**

```
git add apps/compute-engine/src/math/strain.rs apps/compute-engine/tests/math_strain.rs apps/compute-engine/tests/fixtures/strain.json
git commit -m "compute-engine: port strain (TRIMP) with golden test"
```

---

## Task 11: Port sleep consistency — `sleepConsistencyScore` + `sleepConsistencyScoreFromNightFeatures`

**Files:**
- Create: `apps/compute-engine/src/math/sleep_consistency.rs`

Source: `derived-metrics.ts:460-512`. Last-7-nights CV of duration + bedtime + waketime + midpoint, with `unwrapSleepTimes` (subtract 86400 if >64800 to handle wraparound).

- [ ] **Step 1: Add fixture** `apps/compute-engine/tests/fixtures/sleep_consistency.json`
- [ ] **Step 2: Write failing test**
- [ ] **Step 3: Implement** — both functions. **Caveat on `secondsSinceMidnight`:** JS uses `Date.getHours/getMinutes/getSeconds()` which returns process-local time. The Node backend runs in `TZ=UTC` on Cloud Run (set in deploy-backend.yml env), so "process-local" = UTC in production. For parity, Rust must use `ts.naive_utc()`'s `hour/minute/second`, NOT `with_timezone(&tz)`. Do not add a `tz: &Tz` parameter — that would intentionally diverge from JS. If we later want true local-timezone consistency scoring, change BOTH sides in the same PR and refresh fixtures.
- [ ] **Step 4: Commit**

```
git add apps/compute-engine/src/math/sleep_consistency.rs apps/compute-engine/tests/math_sleep_consistency.rs apps/compute-engine/tests/fixtures/sleep_consistency.json
git commit -m "compute-engine: port sleep consistency with golden test"
```

---

## Task 12: Port spo2 desaturation events — `detectDesaturationEvents`

**Files:**
- Create: `apps/compute-engine/src/math/spo2_events.rs`

Source: `apps/backend/src/processing/spo2-events.ts`. Min 30 points; identify ≥4% drops; ODI per hour.

- [ ] **Step 1: Add fixture**
- [ ] **Step 2: Write failing test**
- [ ] **Step 3: Implement** — keep the threshold constants identical.
- [ ] **Step 4: Commit**

---

## Task 13: Port core temperature — `estimateCoreTemperature`

**Files:**
- Create: `apps/compute-engine/src/math/core_temperature.rs`

Source: `apps/backend/src/processing/core-temperature.ts`. Min 10 skin-temp points; nadir time + core estimate.

- [ ] **Step 1: Add fixture**
- [ ] **Step 2-4:** standard pattern

---

## Task 14: Port training load ratio — `computeTrainingLoadRatio`

**Files:**
- Create: `apps/compute-engine/src/math/training_load.rs`

Source: `apps/backend/src/processing/training-load.ts`. Ratio of last-7-day strain to last-28-day strain; risk-zone classification.

- [ ] **Step 1-4:** standard pattern

---

## Task 15: Port recovery index — `computeRecoveryIndex`

**Files:**
- Create: `apps/compute-engine/src/math/recovery_index.rs`

Source: `apps/backend/src/processing/recovery-index.ts`. Composite of HRV vs baseline + LF/HF + prev strain + spo2 + skin temp delta + architecture + sleep duration.

- [ ] **Step 1-4:** standard pattern

---

## Task 16: Top-level `compute_derived_metrics` + full DerivedMetricsBundle golden parity

**Files:**
- Create: `apps/compute-engine/src/derived_metrics.rs`
- Create: `apps/compute-engine/tests/golden.rs`

This task wires together all of Tasks 4–15 and runs the full set of fixtures captured in Task 3.

- [ ] **Step 1: Write the failing top-level test**

```rust
// apps/compute-engine/tests/golden.rs
use noop_compute_engine::{derived_metrics::compute_derived_metrics, types::*};
use std::{fs, path::PathBuf};

#[derive(serde::Deserialize)]
struct Fixture {
    description: String,
    input: ComputeDerivedMetricsDayRequestV1,
    expected: PersistedDailyMetricV1,
}

#[test]
fn golden_parity() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../backend/.fixtures/compute-engine-golden");
    let mut fail = false;
    for entry in fs::read_dir(&dir).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") { continue; }
        let f: Fixture = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        let actual = compute_derived_metrics(&f.input).unwrap();
        if !compare_persisted(&actual, &f.expected) {
            eprintln!("MISMATCH in {}: actual={:?} expected={:?}", f.description, actual, f.expected);
            fail = true;
        }
    }
    assert!(!fail);
}

fn compare_persisted(a: &PersistedDailyMetricV1, b: &PersistedDailyMetricV1) -> bool {
    fn close(a: Option<f64>, b: Option<f64>) -> bool {
        match (a, b) { (None, None) => true, (Some(x), Some(y)) => (x - y).abs() < 1e-4, _ => false }
    }
    close(a.strain_score, b.strain_score)
        && close(a.sleep_consistency_score, b.sleep_consistency_score)
        && a.detected_sleep_nights == b.detected_sleep_nights
        && close(a.skin_temp_avg_celsius, b.skin_temp_avg_celsius)
        && close(a.skin_temp_delta_celsius, b.skin_temp_delta_celsius)
        && close(a.stress_average, b.stress_average)
        && close(a.spo2_average, b.spo2_average)
        && close(a.recovery_index, b.recovery_index)
        && close(a.training_load_ratio, b.training_load_ratio)
        && a.training_load_risk_zone == b.training_load_risk_zone
        && a.spo2_dip_count == b.spo2_dip_count
        && close(a.odi_per_hour, b.odi_per_hour)
        && close(a.lowest_spo2, b.lowest_spo2)
        && close(a.core_temperature_estimate, b.core_temperature_estimate)
        && a.circadian_nadir == b.circadian_nadir
}
```

- [ ] **Step 2: Implement `compute_derived_metrics`** — mirror `derived-metrics.ts:68-155` exactly. Slice samples per day using calendar bounds + `slice_by_timestamp`, call each math module, aggregate. Use the same skin-temp-baseline 7-day window logic.

- [ ] **Step 3: Iterate until all 6 fixtures pass**

```
cargo test --test golden -- --nocapture
```

If a fixture fails, the eprintln tells you which field diverges. Track down the math difference.

- [ ] **Step 4: Add the JS-side fixture parity test**

```ts
// apps/backend/test/compute-engine-fixtures.spec.ts
// Loads each fixture, runs JS computeDerivedMetrics, asserts the result matches the
// fixture's `expected` field within 1e-4 — guards against accidental JS drift.
```

- [ ] **Step 5: Commit**

```
git add apps/compute-engine/src/derived_metrics.rs apps/compute-engine/tests/golden.rs apps/backend/test/compute-engine-fixtures.spec.ts
git commit -m "compute-engine: top-level compute_derived_metrics passes all 6 golden fixtures"
```

---

## Task 17: Axum HTTP handler — `POST /v1/compute/derived-metrics-day` with `spawn_blocking` + gzip

**Files:**
- Create: `apps/compute-engine/src/handlers.rs`
- Modify: `apps/compute-engine/src/main.rs`

- [ ] **Step 1: Wire up router**

```rust
// apps/compute-engine/src/main.rs
use axum::{extract::DefaultBodyLimit, Router, routing::post};
use tower_http::{compression::CompressionLayer, decompression::RequestDecompressionLayer, trace::TraceLayer};
use std::net::SocketAddr;

mod handlers;
mod math;
mod calendar;
pub mod types;
pub mod derived_metrics;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt().json().with_target(false).init();
    let app = Router::new()
        .route("/healthz", axum::routing::get(|| async { "ok" }))
        .route("/v1/compute/derived-metrics-day", post(handlers::compute_day))
        // 32 MiB matches Cloud Run's hard limit; gzipped requests stay under
        // 4 MiB in practice (Task 0) but the post-decompression buffer can
        // exceed axum's 2 MiB default. We're auth-gated so the bomb risk is
        // accepted; see spec "Axum body limits".
        .layer(DefaultBodyLimit::max(32 * 1024 * 1024))
        .layer(TraceLayer::new_for_http())
        .layer(CompressionLayer::new().gzip(true))
        .layer(RequestDecompressionLayer::new().gzip(true));
    let port: u16 = std::env::var("PORT").ok().and_then(|s| s.parse().ok()).unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(%addr, "compute-engine listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
```

- [ ] **Step 2: Implement handler with `spawn_blocking` + 25s server-side deadline**

```rust
// apps/compute-engine/src/handlers.rs
use axum::{Json, http::StatusCode, response::IntoResponse};
use std::time::Duration;
use tokio::time::timeout;
use crate::{types::*, derived_metrics::compute_derived_metrics};

const SERVER_DEADLINE: Duration = Duration::from_secs(25);

pub async fn compute_day(
    Json(req): Json<ComputeDerivedMetricsDayRequestV1>,
) -> impl IntoResponse {
    if req.schema_version != 1 {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({
            "error": "unsupported schemaVersion", "got": req.schema_version
        }))).into_response();
    }
    let span = tracing::info_span!("compute_day", reference_date = %req.reference_date, samples = req.samples.len());
    let _enter = span.enter();
    // CPU-bound: move off the tokio worker thread.
    let join = tokio::task::spawn_blocking(move || compute_derived_metrics(&req));
    // Best-effort deadline. spawn_blocking is NOT cancellable — if this
    // fires, the compute thread keeps running in the background until it
    // finishes. The client already timed out at 30s; we respond at 25s
    // to give the client a clean signal.
    match timeout(SERVER_DEADLINE, join).await {
        Ok(Ok(Ok(metrics))) => (StatusCode::OK, Json(metrics)).into_response(),
        Ok(Ok(Err(e))) => {
            tracing::error!(error = %e, "compute_derived_metrics failed");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response()
        }
        Ok(Err(join_err)) => {
            tracing::error!(error = %join_err, "spawn_blocking join failed");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "internal"}))).into_response()
        }
        Err(_) => {
            tracing::warn!("server-side 25s deadline exceeded; returning 503");
            (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({"error": "deadline_exceeded"}))).into_response()
        }
    }
}
```

- [ ] **Step 3: Integration test via reqwest**

```rust
// apps/compute-engine/tests/http.rs
// Spawn the server on an ephemeral port, POST a golden fixture's input,
// assert the response matches `expected` within 1e-4.
```

- [ ] **Step 4: Run test, commit**

```
cargo test --test http
git add apps/compute-engine/src/handlers.rs apps/compute-engine/src/main.rs apps/compute-engine/tests/http.rs
git commit -m "compute-engine: axum handler with spawn_blocking + gzip"
```

---

## Task 18: Dockerfile + local container smoke test

**Files:**
- Create: `apps/compute-engine/Dockerfile`
- Create: `apps/compute-engine/.dockerignore`

- [ ] **Step 1: Write multi-stage Dockerfile**

```dockerfile
# apps/compute-engine/Dockerfile
FROM rust:1.85-slim AS build
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
# benches/ and tests/ are dev-only — don't ship them. Cargo doesn't need
# them present to build the bin target.
RUN cargo build --release --bin noop-compute-engine

FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=build /app/target/release/noop-compute-engine /app
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/app"]
```

- [ ] **Step 2: `.dockerignore`**

```
target/
*.md
tests/fixtures/
```

- [ ] **Step 3: Local build + smoke test**

```
docker build -t noop-compute-engine:dev apps/compute-engine
docker run --rm -d -p 8080:8080 --name noop-ce noop-compute-engine:dev
sleep 1
curl -fsS http://localhost:8080/healthz
docker stop noop-ce
```

- [ ] **Step 4: Commit**

```
git add apps/compute-engine/Dockerfile apps/compute-engine/.dockerignore
git commit -m "compute-engine: distroless multi-stage Dockerfile"
```

---

## Task 19: NestJS client — `compute-engine-client.ts` with all 10 fallback rules

**Files:**
- Create: `apps/backend/src/pipeline/compute-engine-client.ts`
- Create: `apps/backend/src/pipeline/compute-engine-client.spec.ts`
- Create: `apps/backend/src/pipeline/compute-engine.module.ts`

- [ ] **Step 1: Write the failing client test**

```ts
// apps/backend/src/pipeline/compute-engine-client.spec.ts
import nock from 'nock';
import { ComputeEngineClient } from './compute-engine-client';

describe('ComputeEngineClient fallback semantics', () => {
  beforeEach(() => { process.env.COMPUTE_ENGINE_ENABLED = 'true'; process.env.COMPUTE_ENGINE_URL = 'http://example.test'; });
  afterEach(() => nock.cleanAll());

  it('disables Rust when feature flag off', async () => {
    process.env.COMPUTE_ENGINE_ENABLED = 'false';
    const c = new ComputeEngineClient();
    expect(c.isEnabled()).toBe(false);
  });

  const ctx = { userId: 'u1', runId: 'r1', day: '2026-05-15' };

  it('falls back on network error with reason=network', async () => {
    nock('http://example.test').post('/v1/compute/derived-metrics-day').replyWithError({ code: 'ECONNRESET' });
    const c = new ComputeEngineClient();
    const r = await c.computeDay(sampleRequest(), ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('network');
  });

  it('falls back on 5xx with reason=server_error', async () => {
    nock('http://example.test').post('/v1/compute/derived-metrics-day').reply(503, 'busy');
    const r = await new ComputeEngineClient().computeDay(sampleRequest(), ctx);
    expect(r).toEqual({ ok: false, reason: 'server_error' });
  });

  it('falls back on 401/403 with reason=auth_error', async () => {
    nock('http://example.test').post('/v1/compute/derived-metrics-day').reply(401, 'no');
    const r = await new ComputeEngineClient().computeDay(sampleRequest(), ctx);
    expect(r).toEqual({ ok: false, reason: 'auth_error' });
  });

  it('falls back on schemaVersion mismatch with reason=malformed_response', async () => {
    nock('http://example.test').post('/v1/compute/derived-metrics-day').reply(200, { schemaVersion: 2 });
    const r = await new ComputeEngineClient().computeDay(sampleRequest(), ctx);
    expect(r).toEqual({ ok: false, reason: 'malformed_response' });
  });

  it('falls back on out-of-range strainScore with reason=bad_numeric', async () => {
    nock('http://example.test').post('/v1/compute/derived-metrics-day').reply(200, { schemaVersion: 1, strainScore: 99, /* ... */ });
    const r = await new ComputeEngineClient().computeDay(sampleRequest(), ctx);
    expect(r).toEqual({ ok: false, reason: 'bad_numeric' });
  });

  it('returns ok with parsed result on 200', async () => {
    const result = goldenExpected();
    nock('http://example.test').post('/v1/compute/derived-metrics-day').reply(200, result);
    const r = await new ComputeEngineClient().computeDay(sampleRequest(), ctx);
    expect(r).toEqual({ ok: true, result });
  });

  it('respects 30s timeout', async () => {
    nock('http://example.test').post('/v1/compute/derived-metrics-day').delay(31_000).reply(200, {});
    const r = await new ComputeEngineClient().computeDay(sampleRequest(), ctx);
    expect(r).toEqual({ ok: false, reason: 'timeout' });
  }, 35_000);

  it('emits structured log line on every fallback', async () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation();
    nock('http://example.test').post('/v1/compute/derived-metrics-day').reply(503);
    await new ComputeEngineClient().computeDay(sampleRequest(), ctx);
    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/"event":"compute-engine-fallback"/));
  });
});
```

- [ ] **Step 2: Implement the client**

```ts
// apps/backend/src/pipeline/compute-engine-client.ts
import { Injectable } from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';
import { gzipSync } from 'zlib';
import { ComputeDerivedMetricsDayRequestV1, PersistedDailyMetricV1, PersistedDailyMetricV1Schema } from './compute-engine-types';

type FallbackReason =
  | 'feature_flag_off' | 'network' | 'timeout' | 'server_error'
  | 'auth_error' | 'bad_request' | 'not_found' | 'client_error'
  | 'malformed_response' | 'bad_numeric';

export type ComputeDayResult =
  | { ok: true; result: PersistedDailyMetricV1; durationMs: number }
  | { ok: false; reason: FallbackReason; durationMs: number };

@Injectable()
export class ComputeEngineClient {
  private auth = new GoogleAuth();
  private url = process.env.COMPUTE_ENGINE_URL ?? '';
  private timeoutMs = parseInt(process.env.COMPUTE_ENGINE_TIMEOUT_MS ?? '30000', 10);

  isEnabled(): boolean {
    return process.env.COMPUTE_ENGINE_ENABLED === 'true' && this.url.length > 0;
  }

  async computeDay(
    req: ComputeDerivedMetricsDayRequestV1,
    ctx: { userId: string; runId: string; day: string },
  ): Promise<ComputeDayResult> {
    const start = Date.now();
    if (!this.isEnabled()) return { ok: false, reason: 'feature_flag_off', durationMs: 0 };
    try {
      const client = await this.auth.getIdTokenClient(this.url);
      const body = gzipSync(Buffer.from(JSON.stringify(req)));
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), this.timeoutMs);
      let res: any;
      try {
        res = await client.request({
          url: `${this.url}/v1/compute/derived-metrics-day`,
          method: 'POST',
          headers: { 'content-type': 'application/json', 'content-encoding': 'gzip', 'accept-encoding': 'gzip', 'x-run-id': ctx.runId },
          data: body,
          // gaxios throws on non-2xx by default — opt out so we can map status to fallback reason.
          validateStatus: () => true,
          signal: ac.signal,
          responseType: 'json',
        });
      } finally {
        clearTimeout(timer);
      }
      const status = res.status as number;
      if (status >= 500) return this.fallback('server_error', start, ctx, status);
      if (status === 401 || status === 403) return this.fallback('auth_error', start, ctx, status);
      if (status === 400) return this.fallback('bad_request', start, ctx, status);
      if (status === 404) return this.fallback('not_found', start, ctx, status);
      if (status >= 400) return this.fallback('client_error', start, ctx, status);
      const parsed = PersistedDailyMetricV1Schema.safeParse(res.data);
      if (!parsed.success) return this.fallback('malformed_response', start, ctx, status);
      const v = parsed.data;
      const inRange = (x: number | null, lo: number, hi: number) => x === null || (Number.isFinite(x) && x >= lo && x <= hi);
      if (!inRange(v.strainScore, 0, 21) || !inRange(v.recoveryIndex, 0, 100)) {
        return this.fallback('bad_numeric', start, ctx, status);
      }
      // Emit success log + metric.
      console.log(JSON.stringify({
        event: 'compute-engine-success',
        endpoint: '/v1/compute/derived-metrics-day',
        outcome: 'rust_ok',
        userId: ctx.userId, run_id: ctx.runId, day: ctx.day,
        duration_ms: Date.now() - start,
      }));
      return { ok: true, result: v, durationMs: Date.now() - start };
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.code === 'ABORT_ERR') return this.fallback('timeout', start, ctx);
      return this.fallback('network', start, ctx, undefined, err?.code ?? err?.name ?? 'unknown');
    }
  }

  private fallback(reason: FallbackReason, start: number, ctx: { userId: string; runId: string; day: string }, httpStatus?: number, errorClass?: string): ComputeDayResult {
    const durationMs = Date.now() - start;
    console.warn(JSON.stringify({
      event: 'compute-engine-fallback',
      endpoint: '/v1/compute/derived-metrics-day',
      outcome: `fallback_${reason}`,
      userId: ctx.userId, run_id: ctx.runId, day: ctx.day,
      reason, http_status: httpStatus, error_class: errorClass, duration_ms: durationMs,
    }));
    return { ok: false, reason, durationMs };
  }
}
```

- [ ] **Step 3: Run tests, commit**

```
cd apps/backend && pnpm test compute-engine-client.spec
git add apps/backend/src/pipeline/compute-engine-client.ts apps/backend/src/pipeline/compute-engine-client.spec.ts apps/backend/src/pipeline/compute-engine.module.ts
git commit -m "compute-engine: NestJS client with 10 binding fallback rules"
```

---

## Task 20: Wire client into pipeline.service.ts per-day loop

**Files:**
- Modify: `apps/backend/src/pipeline/pipeline.service.ts` (the existing `derivedMetricsByDay` `.map(...)` at line 580–597)
- Modify: `apps/backend/src/pipeline/pipeline.module.ts`

- [ ] **Step 1: Add per-day dispatch**

Wrap the existing `.map((dayDate) => ({ dayDate, metrics: computeDerivedMetrics(...) }))` with:

```ts
// IMPORTANT: sequential loop, not Promise.all. Rule 6 (sticky fallback)
// requires that we don't start day N's Rust call after day N-1 has already
// failed — otherwise we waste 30s timeouts on every day after the first
// network blip.
const usingRust = this.computeEngineClient.isEnabled();
const runId = crypto.randomUUID();
let stickyFallback = false;
const derivedMetricsByDay: { dayDate: Date; metrics: DerivedMetricsBundle }[] = [];
for (const dayDate of this.collectReferenceDays(sensorRecords, sleepDetections, effectiveFeatures, timeZone)) {
  if (usingRust && !stickyFallback) {
    const req = buildDayRequest({
      samples: sanitized, sensorRecords, effectiveFeatures, sleepDetections,
      recomputedBaseline, dayDate, timeZone,
    });
    const dayKey = this.startOfDay(dayDate, timeZone).toISOString().slice(0, 10);
    const r = await this.computeEngineClient.computeDay(req, { userId, runId, day: dayKey });
    if (r.ok) {
      derivedMetricsByDay.push({ dayDate, metrics: liftPersistedToBundle(r.result) });
      continue;
    }
    stickyFallback = true; // rule 6, phase 1 — fall through to JS for rest of run
  }
  derivedMetricsByDay.push({
    dayDate,
    metrics: computeDerivedMetrics(
      sanitized, sensorRecords, effectiveFeatures, sleepDetections,
      recomputedBaseline, dayDate, timeZone, metricsPrecomputed,
    ),
  });
}
```

`liftPersistedToBundle` wraps `PersistedDailyMetricV1` into a `DerivedMetricsBundle` by filling the unused time series fields with `[]` and converting `circadianNadir` from ISO string back to `Date`:

```ts
function liftPersistedToBundle(p: PersistedDailyMetricV1): DerivedMetricsBundle {
  return {
    stressScores: [], spo2Scores: [], skinTempScores: [], hrvRmssdSeries: [],
    strainScore: p.strainScore,
    sleepConsistencyScore: p.sleepConsistencyScore,
    detectedSleepNights: p.detectedSleepNights,
    skinTempAvgCelsius: p.skinTempAvgCelsius,
    skinTempDeltaCelsius: p.skinTempDeltaCelsius,
    stressAverage: p.stressAverage,
    spo2Average: p.spo2Average,
    lfHfRatioAverage: p.lfHfRatioAverage,
    recoveryIndex: p.recoveryIndex,
    trainingLoadRatio: p.trainingLoadRatio,
    trainingLoadRiskZone: p.trainingLoadRiskZone,
    spo2DipCount: p.spo2DipCount,
    odiPerHour: p.odiPerHour,
    lowestSpo2: p.lowestSpo2,
    coreTemperatureEstimate: p.coreTemperatureEstimate,
    circadianNadir: p.circadianNadir ? new Date(p.circadianNadir) : null,
    sleepArchitectureScore: p.sleepArchitectureScore,
  };
}
```

Metrics are emitted purely via the structured log lines from the client (Task 19). NestJS does not need an injected metrics adapter — we use Cloud Logging log-based metrics (set up in Task 23, new monitoring task).

- [ ] **Step 2: Register the client module**

```ts
// apps/backend/src/pipeline/pipeline.module.ts
import { ComputeEngineClient } from './compute-engine-client';
@Module({
  providers: [..., ComputeEngineClient],
})
```

- [ ] **Step 3: Run existing pipeline integration tests with the flag off** — they MUST still pass (flag off = no behavior change).

```
COMPUTE_ENGINE_ENABLED=false pnpm test pipeline
```

- [ ] **Step 4: Run with the flag on against a locally-running Rust service** (uses Task 18's docker image)

```
docker run --rm -d -p 8080:8080 --name noop-ce noop-compute-engine:dev
COMPUTE_ENGINE_ENABLED=true COMPUTE_ENGINE_URL=http://localhost:8080 \
  pnpm test pipeline -- -t 'derived metrics'
docker stop noop-ce
```

- [ ] **Step 5: Commit**

```
git add apps/backend/src/pipeline/pipeline.service.ts apps/backend/src/pipeline/pipeline.module.ts
git commit -m "pipeline: dispatch per-day compute to Rust engine with sticky JS fallback"
```

---

## Task 21: Cloud Run deploy + IAM

**Files:**
- Create: `.github/workflows/deploy-compute-engine.yml`

- [ ] **Step 1: One-time GCP setup (run manually, not in CI)**

```
gcloud iam service-accounts create noop-compute-engine \
  --project=flashckard \
  --display-name="noop-compute-engine runtime SA"

# The backend Cloud Run service runs as noop-cloud-run@ (see
# .github/workflows/deploy-backend.yml:69). That's the principal that
# fetches the ID token, so that's the one that needs run.invoker.
gcloud run services add-iam-policy-binding noop-compute-engine \
  --region=us-central1 \
  --member="serviceAccount:noop-cloud-run@flashckard.iam.gserviceaccount.com" \
  --role="roles/run.invoker" \
  --project=flashckard
```

(The second command will fail until the service exists — re-run after first deploy.)

- [ ] **Step 2: Write the deploy workflow**

```yaml
# .github/workflows/deploy-compute-engine.yml
name: Deploy compute-engine
on:
  push:
    branches: [main]
    paths:
      - 'apps/compute-engine/**'
      - '.github/workflows/deploy-compute-engine.yml'

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions: { id-token: write, contents: read }
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.WIF_SERVICE_ACCOUNT }}
      - uses: google-github-actions/setup-gcloud@v2
      - run: gcloud builds submit apps/compute-engine --tag=us-central1-docker.pkg.dev/flashckard/noop/compute-engine:${{ github.sha }} --project=flashckard
      - run: |
          gcloud run deploy noop-compute-engine \
            --image=us-central1-docker.pkg.dev/flashckard/noop/compute-engine:${{ github.sha }} \
            --region=us-central1 \
            --memory=512Mi --cpu=2 --cpu-boost --no-cpu-throttling \
            --concurrency=4 --max-instances=10 \
            --timeout=30 \
            --no-allow-unauthenticated \
            --service-account=noop-compute-engine@flashckard.iam.gserviceaccount.com \
            --project=flashckard
```

- [ ] **Step 3: First manual deploy (since WIF may not be wired)**

```
gcloud builds submit apps/compute-engine --tag=us-central1-docker.pkg.dev/flashckard/noop/compute-engine:bootstrap --project=flashckard
gcloud run deploy noop-compute-engine --image=us-central1-docker.pkg.dev/flashckard/noop/compute-engine:bootstrap \
  --region=us-central1 --memory=512Mi --cpu=2 --cpu-boost --no-cpu-throttling \
  --concurrency=4 --max-instances=10 --timeout=30 --no-allow-unauthenticated \
  --service-account=noop-compute-engine@flashckard.iam.gserviceaccount.com --project=flashckard
```

- [ ] **Step 4: Smoke test from local with an ID token**

```
URL=$(gcloud run services describe noop-compute-engine --region=us-central1 --project=flashckard --format='value(status.url)')
TOKEN=$(gcloud auth print-identity-token --audiences="$URL")
curl -fsS -H "Authorization: Bearer $TOKEN" "$URL/healthz"
```

- [ ] **Step 5: Commit**

```
git add .github/workflows/deploy-compute-engine.yml
git commit -m "compute-engine: deploy workflow + Cloud Run config"
```

---

## Task 21A: CI workflow — Rust fmt / clippy / test / cargo-audit / Docker build

**Files:**
- Create: `.github/workflows/ci-compute-engine.yml`

- [ ] **Step 1: Write the CI workflow**

```yaml
# .github/workflows/ci-compute-engine.yml
name: CI compute-engine
on:
  pull_request:
    paths: ['apps/compute-engine/**', 'apps/backend/.fixtures/compute-engine-golden/**', '.github/workflows/ci-compute-engine.yml']
  push:
    branches: [main]
    paths: ['apps/compute-engine/**', 'apps/backend/.fixtures/compute-engine-golden/**', '.github/workflows/ci-compute-engine.yml']

jobs:
  rust:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: apps/compute-engine } }
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with: { components: 'rustfmt,clippy' }
      - uses: Swatinem/rust-cache@v2
        with: { workspaces: apps/compute-engine }
      - run: cargo fmt --all -- --check
      - run: cargo clippy --all-targets --all-features -- -D warnings
      - run: cargo test --all-features

  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: cargo install cargo-audit --locked
      - run: cd apps/compute-engine && cargo audit --deny warnings

  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - run: docker build -t noop-compute-engine:ci apps/compute-engine

  fixture-parity:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm tsx apps/backend/scripts/check-fixtures.ts
      - run: cd apps/backend && pnpm test compute-engine-fixtures.spec
```

- [ ] **Step 2: Commit**

```
git add .github/workflows/ci-compute-engine.yml
git commit -m "ci: fmt/clippy/test/audit/docker for compute-engine"
```

---

## Task 21B: Monitoring — log-based metrics + alert policies

**Files:**
- Create: `infra/monitoring/compute-engine-metrics.tf` (or `.json` if not using Terraform)
- Create: `infra/monitoring/compute-engine-alerts.tf`

The team uses `gcloud` directly for monitoring (no Terraform yet). Each metric and alert is created by a shell script kept under `infra/monitoring/`.

- [ ] **Step 1: Create log-based metrics**

```bash
# infra/monitoring/create-compute-engine-metrics.sh
#!/usr/bin/env bash
set -euo pipefail
PROJECT=flashckard

# 1. compute_engine_requests_total
gcloud logging metrics create compute_engine_requests_total \
  --description="Compute-engine request count by endpoint + outcome" \
  --log-filter='jsonPayload.event=("compute-engine-success" OR "compute-engine-fallback")' \
  --label-extractors='endpoint=EXTRACT(jsonPayload.endpoint),outcome=EXTRACT(jsonPayload.outcome)' \
  --value-extractor='' \
  --project=$PROJECT || true

# 2. compute_engine_latency_seconds — distribution metric from duration_ms
gcloud logging metrics create compute_engine_latency_seconds \
  --description="Compute-engine round-trip latency by endpoint + outcome" \
  --log-filter='jsonPayload.event=("compute-engine-success" OR "compute-engine-fallback")' \
  --label-extractors='endpoint=EXTRACT(jsonPayload.endpoint),outcome=EXTRACT(jsonPayload.outcome)' \
  --value-extractor='EXTRACT(jsonPayload.duration_ms)' \
  --metric-descriptor-from-file=<(cat <<EOF
{
  "metricKind": "DELTA",
  "valueType": "DISTRIBUTION",
  "unit": "ms",
  "displayName": "Compute Engine Latency",
  "bucketOptions": {
    "explicitBuckets": { "bounds": [50, 100, 500, 1000, 5000, 30000] }
  }
}
EOF
) --project=$PROJECT || true

# 3. compute_engine_panics_total
gcloud logging metrics create compute_engine_panics_total \
  --description="Rust panics in compute-engine" \
  --log-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="noop-compute-engine" AND severity="ERROR" AND textPayload=~"panicked at"' \
  --project=$PROJECT || true

echo "metrics created"
```

- [ ] **Step 2: Create alert policies**

```bash
# infra/monitoring/create-compute-engine-alerts.sh
#!/usr/bin/env bash
set -euo pipefail
PROJECT=flashckard
NOTIFY_CHANNEL=$(gcloud alpha monitoring channels list --project=$PROJECT --filter="displayName:Nishant Pager" --format="value(name)" | head -1)

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
  "notificationChannels": ["$NOTIFY_CHANNEL"]
}
EOF
  gcloud alpha monitoring policies create --policy-from-file=/tmp/policy.json --project=$PROJECT
}

# Auth error: any > 0 over 5min
create_policy "compute-engine auth_error" \
  'metric.type="logging.googleapis.com/user/compute_engine_requests_total" AND metric.labels.outcome="fallback_auth_error"' \
  0 300s

# Bad request / malformed response: any > 0 over 5min (schema drift)
create_policy "compute-engine schema_drift" \
  'metric.type="logging.googleapis.com/user/compute_engine_requests_total" AND (metric.labels.outcome="fallback_bad_request" OR metric.labels.outcome="fallback_malformed_response")' \
  0 300s

# Total fallback rate > 5% over 30min (the simple way: fallback count > 5/min absolute)
create_policy "compute-engine high fallback rate" \
  'metric.type="logging.googleapis.com/user/compute_engine_requests_total" AND metric.labels.outcome=monitoring.regex.full_match("fallback_.*")' \
  0.083 1800s   # 0.083/sec = 5/min sustained for 30min

# Panic counter > 0
create_policy "compute-engine panic" \
  'metric.type="logging.googleapis.com/user/compute_engine_panics_total"' \
  0 60s
```

- [ ] **Step 3: Run both scripts manually (one-time)**

```
bash infra/monitoring/create-compute-engine-metrics.sh
bash infra/monitoring/create-compute-engine-alerts.sh
```

- [ ] **Step 4: Commit**

```
git add infra/monitoring/
git commit -m "monitoring: compute-engine log-based metrics + alert policies"
```

---

## Task 21C: Backend deploy env-vars + secrets

**Files:**
- Modify: `.github/workflows/deploy-backend.yml`

- [ ] **Step 1: Add new env-vars to deploy-backend.yml**

Three new env vars must reach the backend Cloud Run service:
- `COMPUTE_ENGINE_ENABLED` (defaults to `false`; flip to `true` per-environment)
- `COMPUTE_ENGINE_URL` (the compute-engine Cloud Run URL, no trailing slash)
- `COMPUTE_ENGINE_TIMEOUT_MS` (optional, default 30000)
- `COMPUTE_ENGINE_SHADOW` (optional, only set on staging during validation)

```yaml
# Add to the `set-env-vars` portion of the `gcloud run deploy` step in deploy-backend.yml
--update-env-vars=...,COMPUTE_ENGINE_ENABLED=false,COMPUTE_ENGINE_URL=https://noop-compute-engine-<hash>-uc.a.run.app
```

For Phase 1 we keep `COMPUTE_ENGINE_ENABLED=false` in the workflow default. Flipping it on is a manual `gcloud run services update` step until shadow validation passes — see Task 23 / 23A runbook.

- [ ] **Step 2: After first compute-engine deploy, capture the URL**

```
gcloud run services describe noop-compute-engine --region=us-central1 --project=flashckard --format='value(status.url)'
```

Paste that into `deploy-backend.yml`'s `COMPUTE_ENGINE_URL` value.

- [ ] **Step 3: Commit**

```
git add .github/workflows/deploy-backend.yml
git commit -m "backend deploy: wire compute-engine env vars (flag off by default)"
```

---

## Task 22: Local microbenchmark gate — `cargo bench` vs JS, must hit ≥5×

**Files:**
- Create: `apps/compute-engine/benches/derived_metrics.rs`
- Create: `apps/backend/src/scripts/bench-compute-day.ts`

This is THE Phase 1 promotion gate. If it fails, the whole project gets re-scoped.

- [ ] **Step 1: Write the Rust benchmark**

```rust
// apps/compute-engine/benches/derived_metrics.rs
use criterion::{Criterion, criterion_group, criterion_main, black_box};
use noop_compute_engine::{derived_metrics::compute_derived_metrics, types::ComputeDerivedMetricsDayRequestV1};

fn bench_compute_day(c: &mut Criterion) {
    let fixture = include_str!("../../backend/.fixtures/compute-engine-golden/normal-ist.json");
    let parsed: serde_json::Value = serde_json::from_str(fixture).unwrap();
    let input: ComputeDerivedMetricsDayRequestV1 = serde_json::from_value(parsed["input"].clone()).unwrap();
    c.bench_function("compute_day_normal_ist", |b| b.iter(|| compute_derived_metrics(black_box(&input)).unwrap()));
}

criterion_group!(benches, bench_compute_day);
criterion_main!(benches);
```

```
cd apps/compute-engine && cargo bench --bench derived_metrics 2>&1 | tee /tmp/rust-bench.txt
```

Note the `time:` per-iteration median.

- [ ] **Step 2: Write the matching JS benchmark**

```ts
// apps/backend/src/scripts/bench-compute-day.ts
import { computeDerivedMetrics, precomputeMetricSeries } from '../processing/derived-metrics';
import { readFileSync } from 'fs';
import { performance } from 'perf_hooks';
const fx = JSON.parse(readFileSync('apps/backend/.fixtures/compute-engine-golden/normal-ist.json', 'utf8'));
const { samples, sensorRecords, nightFeatures, sleepDetections, baseline, referenceDate, timeZone } = fx.input;
const samplesD = samples.map((s: any) => ({ ...s, timestamp: new Date(s.timestamp) }));
const sensorD = sensorRecords.map((s: any) => ({ ...s, timestamp: new Date(s.timestamp) }));
const featuresD = nightFeatures.map((f: any) => ({ ...f, nightDate: new Date(f.nightDate) }));
const detD = sleepDetections.map((d: any) => ({ ...d, nightDate: new Date(d.nightDate), bedtime: new Date(d.bedtime), wakeTime: new Date(d.wakeTime) }));
const refDate = new Date(referenceDate);
// Warm-up
for (let i = 0; i < 5; i++) {
  const pre = precomputeMetricSeries(samplesD, sensorD);
  computeDerivedMetrics(samplesD, sensorD, featuresD, detD, baseline, refDate, timeZone, pre);
}
const N = 100;
const t0 = performance.now();
for (let i = 0; i < N; i++) {
  const pre = precomputeMetricSeries(samplesD, sensorD);
  computeDerivedMetrics(samplesD, sensorD, featuresD, detD, baseline, refDate, timeZone, pre);
}
const t1 = performance.now();
console.log(JSON.stringify({ iterations: N, totalMs: t1 - t0, perIterMs: (t1 - t0) / N }, null, 2));
```

```
npx tsx apps/backend/src/scripts/bench-compute-day.ts | tee /tmp/js-bench.txt
```

- [ ] **Step 3: Compute the ratio**

```
rust_us=$(grep -oE 'time:.*\[[^ ]+' /tmp/rust-bench.txt | head -1)
js_ms=$(grep perIterMs /tmp/js-bench.txt | grep -oE '[0-9.]+' | head -1)
# Convert both to microseconds, compute js_us / rust_us. Gate: ≥ 5.0.
```

- [ ] **Step 4: Document the result**

Write the ratio + raw numbers to `docs/superpowers/specs/2026-05-19-rust-compute-engine-design.md` under a new "Phase 1 measurement" section. Commit.

**Promotion gate: if ratio < 5.0, STOP HERE.** Open an issue summarizing the gap and the path forward (profile Rust, profile JS, identify where the speedup is bottlenecked). Do not proceed to Phase 2.

- [ ] **Step 5: Commit**

```
git add apps/compute-engine/benches/derived_metrics.rs apps/backend/src/scripts/bench-compute-day.ts docs/superpowers/specs/2026-05-19-rust-compute-engine-design.md
git commit -m "compute-engine: Phase 1 microbenchmark — XXx speedup vs JS"
```

---

## Task 23: 1-week shadow run on staging

**Files:**
- Modify: `apps/backend/src/pipeline/compute-engine-client.ts` (add `shadow` mode)
- Modify: `apps/backend/src/pipeline/pipeline.service.ts`

When `COMPUTE_ENGINE_SHADOW=true`, run BOTH paths per day and log diffs. JS result is what gets persisted; Rust result is logged only.

- [ ] **Step 1: Add shadow mode to the dispatcher**

```ts
const shadowMode = process.env.COMPUTE_ENGINE_SHADOW === 'true';
// In the per-day map:
if (shadowMode) {
  const [jsResult, rustResult] = await Promise.all([
    Promise.resolve(computeDerivedMetrics(...)),
    this.computeEngineClient.computeDay(req),
  ]);
  if (rustResult.ok) {
    const diffs = diffPersisted(jsResult, rustResult.result);
    if (diffs.length > 0) {
      console.warn(JSON.stringify({ event: 'compute-engine-shadow-diff', day: dayDate, diffs }));
    }
  }
  return { dayDate, metrics: jsResult };
}
```

- [ ] **Step 2: Deploy to staging with shadow on**

```
gcloud run services update noop-backend \
  --region=us-central1 \
  --update-env-vars=COMPUTE_ENGINE_ENABLED=true,COMPUTE_ENGINE_SHADOW=true,COMPUTE_ENGINE_URL=https://noop-compute-engine-<hash>-uc.a.run.app \
  --project=flashckard
```

- [ ] **Step 3: Let it run for 7 days. Each day, query Cloud Logging:**

```
gcloud logging read 'jsonPayload.event="compute-engine-shadow-diff"' --project=flashckard --limit=100 --format=json
```

Triage every diff. Anything > 1e-4 is a bug. Fix in Rust, redeploy, restart the 7-day clock if a meaningful bug is found.

- [ ] **Step 4: Final commit + spec annotation**

After 7 clean days (no diffs > 1e-4):

```
git add ...
git commit -m "compute-engine: shadow run clean for 7 days — ready to promote"
```

Append a "Phase 1 shadow validation" section to the spec with: dates run, total days computed, diffs found, max diff seen.

---

## Task 23A: Error budget + rollback runbook

**Files:**
- Create: `docs/runbooks/compute-engine.md`

- [ ] **Step 1: Write the runbook**

```markdown
# Runbook: compute-engine fallback / outage

## Error budget — Phase 1

- Fallback rate target: <0.1% per 24h sliding window (≈ <1 per 1000 day-compute calls)
- Hard ceiling before auto-disable: 5% per 30min sustained (alert wakes oncall)

## How to disable

If alerts fire or you see degraded user behavior tied to compute-engine:

```bash
gcloud run services update noop-backend \
  --region=us-central1 \
  --update-env-vars=COMPUTE_ENGINE_ENABLED=false \
  --project=flashckard
```

Effect: backend stops calling Rust, runs JS path in-process. No data loss; results identical (modulo any Rust-side bug under investigation).

## How to re-enable after fix

```bash
gcloud run services update noop-backend \
  --region=us-central1 \
  --update-env-vars=COMPUTE_ENGINE_ENABLED=true \
  --project=flashckard
```

Watch dashboards for 30min. If fallback rate returns above ceiling within 1 hour, leave disabled and escalate.

## Diagnostic queries

Fallback breakdown by reason (last 1h):
```
gcloud logging read 'jsonPayload.event="compute-engine-fallback"' \
  --project=flashckard --freshness=1h --format='value(jsonPayload.reason)' | sort | uniq -c
```

Slow day-computes (>10s):
```
gcloud logging read 'jsonPayload.event=("compute-engine-success" OR "compute-engine-fallback") AND jsonPayload.duration_ms>10000' \
  --project=flashckard --freshness=1h --limit=50
```

Recent panics:
```
gcloud logging read 'resource.labels.service_name="noop-compute-engine" AND textPayload=~"panicked at"' \
  --project=flashckard --freshness=1h --limit=20
```

## Escalation

- Page on:`compute-engine auth_error` (means IAM broke — fix and re-grant `roles/run.invoker`)
- Page on `compute-engine schema_drift` (means TS↔Rust contract diverged — find recent merge, revert or fix)
- Page on `compute-engine panic` (means a Rust math function panicked on unexpected input — capture the panic log, add to fixture set, fix Rust)
```

- [ ] **Step 2: Commit**

```
git add docs/runbooks/compute-engine.md
git commit -m "runbook: compute-engine error budget + disable/enable procedure"
```

---

## Task 24: Phase 1 sign-off

- [ ] **Step 1: All three Phase 1 gates pass:**
  1. **Correctness parity** — 6 golden fixtures pass + 7-day shadow clean (Task 23)
  2. **Local microbenchmark** — ≥5× (Task 22)
  3. **E2E sanity** — Cloud Run round-trip P95 < 5s (verify from `compute_engine_latency_seconds` p95 over the 7-day shadow window)

- [ ] **Step 2: Write Phase 2 plan**

Use the writing-plans skill again with the Phase 2 sub-spec (batch endpoint, rayon parallelism, all-or-JS fallback). Out of scope for this plan.

---

## Notes for the implementer

- **TDD discipline:** Tasks 4–16 each follow Write fixture → Write failing test → Implement → Pass → Commit. Don't skip the failing-test step.
- **JS is the source of truth.** When Rust output differs from JS by >1e-4, the bug is almost always Rust. Read the JS line-by-line.
- **Mind float ordering.** Rust `iter().sum::<f64>()` may differ from JS sequential `+=` by an ULP. If a sum is the source of drift, mirror JS's left-fold exactly.
- **Don't refactor JS.** The JS path is the fallback. Touching it during this plan widens the parity surface. Resist.
- **Per-day request building.** Phase 1 builds one request per day, but each request still needs the full multi-day inputs (rolling windows look back). Pass the full set each call. Phase 2 will fix that.
- **Cloud Run cold starts.** Phase 1 doesn't set `--min-instances=1` (waste of money for an experiment). Expect ~2–4s cold-start latency. The E2E sanity gate accounts for this.
- **Commit cadence:** every passing test gets its own commit. Easier to revert one math module than a 1000-line PR.
