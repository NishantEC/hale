# Operations

What it takes to keep this service healthy in production. Single-user
deployment on Cloud Run + Cloud SQL today; the playbook below assumes
that shape.

## Migrations

Three migration systems run against the same Postgres database. They
do not share state — apply them in order.

### 1. TypeORM (application schema)

Source: `apps/backend/src/migrations/*.ts`. Tracked in the
`typeorm_migrations` table.

Apply locally:
```sh
cd apps/backend
pnpm build
node node_modules/typeorm/cli.js migration:run -d dist/typeorm.datasource.js
```

Apply in production: the `Run TypeORM migrations` step in
`.github/workflows/deploy-backend.yml` runs this as a Cloud Run job
before each deploy. Idempotent — already-applied migrations are skipped.

Generate a new migration after editing entities:
```sh
cd apps/backend
pnpm build
node node_modules/typeorm/cli.js migration:generate \
  -d dist/typeorm.datasource.js \
  src/migrations/AddSomeColumn
```

### 2. Better Auth (session/user tables)

Better Auth manages its own `user`, `session`, `account`, `verification`
tables. Migrations are emitted by the better-auth CLI based on the
config in `src/auth/auth.ts`.

Apply locally:
```sh
cd apps/backend
pnpm exec @better-auth/cli migrate --config dist/auth/auth.js -y
```

Apply in production: the `Run better-auth migrations` step in
`.github/workflows/deploy-backend.yml`.

### 3. Drizzle (mobile app SQLite)

Source: `apps/app/app/services/db/migrations/*.sql` plus the journal at
`meta/_journal.json`. Tracked in the device's own `__drizzle_migrations`
table — applied automatically by `runMigrations()` on app launch.

When the Drizzle schema changes:
1. Edit `schema.ts`.
2. Run `pnpm db:generate` to emit a new `XXXX_*.sql`.
3. Append the new migration to `migrations.js` (inlined to dodge Metro's
   `.sql` resolver weirdness) and to `meta/_journal.json`.
4. The `IMMUTABILITY RULE` at the top of `migrations.js` applies — never
   edit an already-shipped migration.

### Verifying migrations apply cleanly from scratch

```sh
# Local Postgres reset
docker compose down -v
docker compose up -d
sleep 5
cd apps/backend && pnpm build
node node_modules/typeorm/cli.js migration:run -d dist/typeorm.datasource.js
pnpm exec @better-auth/cli migrate --config dist/auth/auth.js -y
```

If this fails on a fresh DB, a migration has a hidden dependency on
manual state. Fix it now — production runs the same sequence.

## Backups

**Current state (verified 2026-05-13):** Cloud SQL automated backups
already enabled — daily 03:00 UTC, 14-day retention, PITR off. Storage
cost ≈ $0.10/month at single-user data volume.

Verify any time:
```sh
gcloud sql instances describe noop-db --project=flashckard \
  --format="value(settings.backupConfiguration.enabled,settings.backupConfiguration.startTime,settings.backupConfiguration.backupRetentionSettings.retainedBackups)"
gcloud sql backups list --instance=noop-db --project=flashckard
```

`setup-cloud-sql-backups.sh` is idempotent — re-run any time to confirm
the configuration matches the desired state (currently 14-day retention
+ PITR; edit the script to lower retention or skip PITR if you want to
cut backup storage cost further).

For an ad-hoc dump (e.g. before a risky migration or for off-site copy):

```sh
PROJECT_ID=flashckard \
CLOUDSQL_INSTANCE=flashckard:us-central1:noop-db \
DB_NAME=noop \
DB_USER=noop \
BACKUP_BUCKET=gs://noop-backups \
./apps/backend/scripts/backup-db.sh
```

Restore from GCS:
```sh
gsutil cp gs://noop-backups/noop/noop-XXXX.sql.gz ./
gunzip -c noop-XXXX.sql.gz | psql -h localhost -U noop noop
```

## Error reporting (Sentry)

Init code is in `src/main.ts` (backend) and
`app/services/observability/sentry.ts` (app). Both are no-ops until the
DSN env var is set:

- Backend: `SENTRY_DSN`
- App: `EXPO_PUBLIC_SENTRY_DSN`

To enable in production:
1. Create a project at https://sentry.io.
2. Backend: add `SENTRY_DSN` to the Cloud Run secret/env vars (along
   with `SENTRY_RELEASE=$(git rev-parse HEAD)` ideally wired by CI).
3. App: install `@sentry/react-native` (`cd apps/app && pnpm add @sentry/react-native`),
   then `pnpm exec sentry-wizard -i reactNative` to set up native projects.
4. Set `EXPO_PUBLIC_SENTRY_DSN` in EAS Build env vars.

Until installed, the app shim logs a warning at boot but doesn't crash.

## Uptime monitoring

Two endpoints exposed by `src/liveness/liveness.controller.ts`:

- `GET /livez` — process is up. No DB. Fast.
- `GET /readyz` — process up AND DB round-trips. Returns `dbLatencyMs`.

**Active monitor: GitHub Actions cron** (`.github/workflows/uptime.yml`).
Pings `/readyz` every 10 minutes. GitHub emails the repo owner on
workflow failure — zero-signup, zero-cost alerting. Run history is
visible under the Actions tab. Costs ~60 free GitHub Actions minutes per
month (well inside the 2,000-min free tier on private repos).

If you outgrow this:
- **Healthchecks.io** — free 20 checks, supports email + webhook +
  Slack. Point a check at `https://api.noop.enform.co/readyz`.
- **GCP Cloud Monitoring → Uptime Checks** — free for first 3 checks.
- **Better Stack / UptimeRobot** — equivalent free tiers.

## Cost picture (single-user)

As of 2026-05-13, approximate monthly spend on GCP:

| Component | Spec | ~Cost |
|---|---|---|
| Cloud SQL `noop-db` | `db-f1-micro`, ALWAYS on, 10 GB SSD | $8 |
| Cloud Run `noop-backend` | 1 CPU / 1 Gi, `min-instances=0` | <$1 (scales to zero between requests) |
| Cloud SQL backups | 14 days × ~100 MB/day | $0.10 |
| Cloud Storage (backup bucket, if used) | negligible | <$0.05 |
| Cloud Build / Artifact Registry | per-deploy | <$0.50 |
| **Total** | | **~$10/month** |

The dominant fixed cost is the `db-f1-micro` Cloud SQL instance running
24/7. Cloud SQL has no "scale to zero" option — even an idle instance
bills around the clock.

**If you want to get this closer to $0:**

- **Neon** (https://neon.tech) — free tier: 0.5 GB storage, scales to
  zero between queries, daily backups included. Postgres 15-compatible.
  Drop-in for the Cloud SQL TypeORM datasource.
- **Supabase** (https://supabase.com) — free tier: 500 MB Postgres,
  daily backups, generous bandwidth. Also drop-in.
- **Render** managed Postgres — free tier limited to 90 days then
  deleted; not great for a single-user app you want to keep running.

To migrate:
1. `pg_dump` from Cloud SQL (use `scripts/backup-db.sh`).
2. Create the target DB on Neon/Supabase. Restore with `psql`.
3. Update Cloud Run env vars `DB_HOST`, `DB_PORT`, `DB_USER`,
   `DB_PASSWORD`, `DB_NAME` to point at the new instance. Remove
   `INSTANCE_CONNECTION_NAME` and the `--set-cloudsql-instances` flag in
   `.github/workflows/deploy-backend.yml`.
4. Delete the Cloud SQL instance.

Single-user data volume (probably <500 MB) fits comfortably in both free
tiers. The tradeoff: Neon free-tier scales-to-zero means the first query
after idle (likely from your /readyz cron) has a ~1s cold start. Backups
on these free tiers are daily snapshots only, no PITR — for
single-user life-data, daily snapshots are usually enough.

## Storage / scale ceiling

The current `raw_sensor_records` table is a vanilla Postgres table — no
partitioning, no compression. A continuous-monitoring user generates
~100–200 MB/year of raw rows. Backups are cheap at that size and 45-day
range scans stay fast on the existing `(userId, timestamp)` index.

When you outgrow this (somewhere north of 1–2 GB / multi-year data) the
mechanical move is to **TimescaleDB hypertables** with day-chunks plus
GORILLA compression on chunks older than 7 days. Typical compression
ratio is ~10× for biometric numeric columns. That requires:

1. Moving off Cloud SQL (which doesn't ship TimescaleDB). Options:
   - Timescale Cloud (managed; ~$30/mo starter tier)
   - Self-hosted Postgres + TimescaleDB extension on a VM
   - AlloyDB for PostgreSQL (GCP) which has columnar engine in newer
     versions but isn't directly equivalent
2. `SELECT create_hypertable('raw_sensor_records', 'timestamp', chunk_time_interval => INTERVAL '1 day');`
3. `SELECT add_compression_policy('raw_sensor_records', INTERVAL '7 days');`

Not urgent at single-user scale. Revisit when storage costs visible or
backups take more than a few minutes.

## Pipeline runtime budget

The pipeline emits a structured log on completion:

```
Pipeline complete for user=X: detections=2 stages=2 features=2 total=1240ms \
  fetch=180ms sleep-detect=45ms activity-detect=210ms sleep-stages=80ms \
  compute=120ms write=605ms
```

`PIPELINE_BUDGET_MS` (default 45,000) is the warn threshold. Runs that
exceed it log at WARN with `— exceeded PIPELINE_BUDGET_MS=...; possible
regression`. Hook this string into a log-based alert in Cloud Logging or
ship it to Sentry as a breadcrumb.

The incremental short-circuit (Sprint 3) means most runs return in
<100ms; the budget primarily catches regressions on real recompute runs.

## Pool sizing

Defaults are `DB_POOL_MAX=5` for the request pool and `AUTH_DB_POOL_MAX=2`
for the better-auth pool. Cloud Run with `--max-instances=5` gives a
theoretical ceiling of 5 × 7 = 35 simultaneous connections, well under
Cloud SQL Postgres 13's default `max_connections=100`. Bump
`DB_POOL_MAX` only if request latency spikes correlate with pool
saturation (visible as pool wait time in OTEL spans once those land).
