# Noop Backend API — Design Spec

## Problem
The iOS app processes all data on-device. There's no backend to:
1. Persist data across installs/devices
2. Enable a future BLE relay (Mac/Pi) to push data when app is closed
3. Provide a sync API for multi-device access or web dashboard
4. Populate historical data for features like hypnogram and trends

## Stack

| Layer | Technology | Hosting | Cost |
|-------|-----------|---------|------|
| API | NestJS (TypeScript) | Cloud Run | Free tier |
| Database | PostgreSQL 16 + TimescaleDB | Docker on GCE (e2-small) | GCP credits |
| Auth | passport-jwt (self-hosted, no vendor) | In NestJS | Free |
| Container Registry | Google Artifact Registry | GCP | Free tier |

All components are open-source and self-hostable. No vendor lock-in.

## Database Schema

### Relational Tables (regular PostgreSQL)

```sql
-- Users & devices
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  strap_serial TEXT,
  paired_at TIMESTAMPTZ DEFAULT now()
);

-- Sleep plan / user config
CREATE TABLE sleep_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  target_sleep_minutes INT DEFAULT 480,
  wake_minutes INT DEFAULT 420,
  alarm_enabled BOOLEAN DEFAULT false,
  alarm_minutes INT DEFAULT 420,
  smart_wake_enabled BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Journal entries
CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  factor_tag TEXT NOT NULL,
  intensity INT NOT NULL,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Baseline profile
CREATE TABLE baseline_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  resting_heart_rate DOUBLE PRECISION,
  rmssd DOUBLE PRECISION,
  sdnn DOUBLE PRECISION,
  nights_used INT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Time-Series Tables (TimescaleDB hypertables)

```sql
-- Raw signal samples (HR, IBI, motion) — high frequency
CREATE TABLE signal_samples (
  time TIMESTAMPTZ NOT NULL,
  user_id UUID NOT NULL,
  source TEXT NOT NULL, -- 'strap' or 'healthkit'
  heart_rate DOUBLE PRECISION,
  ibi_ms DOUBLE PRECISION,
  motion_score DOUBLE PRECISION,
  quality_score DOUBLE PRECISION
);
SELECT create_hypertable('signal_samples', 'time');
CREATE INDEX idx_signal_user_time ON signal_samples (user_id, time DESC);

-- Nightly features (1 row per night)
CREATE TABLE night_features (
  time TIMESTAMPTZ NOT NULL, -- night_date
  user_id UUID NOT NULL,
  resting_heart_rate DOUBLE PRECISION,
  rmssd DOUBLE PRECISION,
  sdnn DOUBLE PRECISION,
  respiratory_rate DOUBLE PRECISION,
  continuity DOUBLE PRECISION,
  regularity DOUBLE PRECISION,
  valid_coverage DOUBLE PRECISION,
  confidence_raw DOUBLE PRECISION,
  sleep_estimate_hours DOUBLE PRECISION,
  source_blend TEXT
);
SELECT create_hypertable('night_features', 'time');

-- Sleep detection summaries (1 per night)
CREATE TABLE sleep_detections (
  time TIMESTAMPTZ NOT NULL, -- night_date
  user_id UUID NOT NULL,
  bedtime TIMESTAMPTZ,
  wake_time TIMESTAMPTZ,
  duration_hours DOUBLE PRECISION,
  interruption_count INT,
  continuity DOUBLE PRECISION,
  regularity DOUBLE PRECISION,
  valid_coverage DOUBLE PRECISION,
  confidence DOUBLE PRECISION
);
SELECT create_hypertable('sleep_detections', 'time');

-- Sleep stage summaries + epoch timeline (1 per night)
CREATE TABLE sleep_stages (
  time TIMESTAMPTZ NOT NULL, -- night_date
  user_id UUID NOT NULL,
  rem_minutes INT,
  core_minutes INT,
  deep_minutes INT,
  awake_minutes INT,
  unknown_minutes INT,
  confidence DOUBLE PRECISION,
  source TEXT,
  epoch_timeline JSONB, -- [{t: unix, s: "rem"}, ...]
  epoch_minutes INT DEFAULT 1
);
SELECT create_hypertable('sleep_stages', 'time');

-- Daily wellness scores
CREATE TABLE daily_scores (
  time TIMESTAMPTZ NOT NULL, -- day_date
  user_id UUID NOT NULL,
  daily_balance INT,
  load_pressure INT,
  sleep_reserve_hours DOUBLE PRECISION,
  confidence TEXT,
  recommendation TEXT,
  detail TEXT
);
SELECT create_hypertable('daily_scores', 'time');

-- Daily derived metrics (stress, spo2, skin temp, strain, consistency)
CREATE TABLE daily_metrics (
  time TIMESTAMPTZ NOT NULL,
  user_id UUID NOT NULL,
  stress_average DOUBLE PRECISION,
  spo2_average DOUBLE PRECISION,
  skin_temp_avg_celsius DOUBLE PRECISION,
  skin_temp_delta_celsius DOUBLE PRECISION,
  strain_score DOUBLE PRECISION,
  sleep_consistency_score DOUBLE PRECISION,
  detected_sleep_nights INT
);
SELECT create_hypertable('daily_metrics', 'time');
```

## API Endpoints

### Auth
- `POST /auth/register` — email + password, returns JWT
- `POST /auth/login` — email + password, returns JWT
- `POST /auth/refresh` — refresh token

### Sync (main iOS app integration)
- `POST /sync/push` — iOS app pushes a batch of processed data:
  ```json
  {
    "nightFeatures": [...],
    "sleepDetections": [...],
    "sleepStages": [...],
    "dailyScores": [...],
    "dailyMetrics": [...],
    "signalSamples": [...],
    "journalEntries": [...],
    "sleepPlan": {...},
    "baselineProfile": {...}
  }
  ```
  Server upserts by (user_id, time) — idempotent.

- `GET /sync/pull?since=<ISO8601>` — pull all data modified since timestamp
  Returns same structure as push. iOS app merges into SwiftData.

- `GET /sync/status` — last sync timestamps per data type

### Data Queries (for future web dashboard)
- `GET /sleep/:date` — single night's full breakdown
- `GET /sleep/range?from=&to=` — date range of sleep summaries
- `GET /trends?metric=rmssd&days=30` — trend data for charting
- `GET /journal` — journal entries with optional factor filter

### Device Management
- `POST /devices` — register a device
- `GET /devices` — list user's devices
- `DELETE /devices/:id` — unpair

## NestJS Project Structure

```
noop-api/
  src/
    app.module.ts
    main.ts
    auth/
      auth.module.ts
      auth.controller.ts
      auth.service.ts
      jwt.strategy.ts
    sync/
      sync.module.ts
      sync.controller.ts
      sync.service.ts
    sleep/
      sleep.module.ts
      sleep.controller.ts
      sleep.service.ts
    trends/
      trends.module.ts
      trends.controller.ts
      trends.service.ts
    journal/
      journal.module.ts
      journal.controller.ts
      journal.service.ts
    devices/
      devices.module.ts
      devices.controller.ts
      devices.service.ts
    database/
      database.module.ts
      entities/
        user.entity.ts
        device.entity.ts
        signal-sample.entity.ts
        night-feature.entity.ts
        sleep-detection.entity.ts
        sleep-stage.entity.ts
        daily-score.entity.ts
        daily-metric.entity.ts
        journal-entry.entity.ts
        sleep-plan.entity.ts
        baseline-profile.entity.ts
  docker-compose.yml        # Local dev: postgres + timescaledb
  Dockerfile                # Cloud Run deployment
  .env.example
```

## iOS App Changes

### New: SyncService.swift (~200 lines)
- Manages auth token storage (Keychain)
- `pushToBackend()` — serializes recent SwiftData records → POST /sync/push
- `pullFromBackend()` — GET /sync/pull → merges into SwiftData
- Called after each pipeline run and on app foreground
- Conflict resolution: server wins for older data, device wins for current day

### Modified: DashboardViewModel.swift
- After `runWellnessPipeline()` completes, call `syncService.pushToBackend()`
- On app foreground (existing auto-sync), also call `syncService.pullFromBackend()`
- New user setting: "Cloud Sync" toggle in device settings

## Deployment

### Local Development
```bash
docker-compose up  # postgres:16-timescaledb on port 5432
npm run start:dev  # NestJS on port 3000
```

### Google Cloud
1. GCE instance (e2-small) running Docker with TimescaleDB
2. Cloud Run for NestJS API (auto-deploys from Artifact Registry)
3. Cloud Build triggers on git push

## Verification
1. `docker-compose up` starts DB, `npm run start:dev` starts API
2. `POST /auth/register` creates user, returns JWT
3. `POST /sync/push` with sample data, verify in DB with `psql`
4. `GET /sync/pull` returns pushed data
5. iOS app: toggle cloud sync, verify push after pipeline run
6. iOS app: fresh install, login, verify pull populates SwiftData
