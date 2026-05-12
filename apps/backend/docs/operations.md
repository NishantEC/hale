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

Cloud SQL has native automated backups. Enable them once via
`scripts/setup-cloud-sql-backups.sh`:

```sh
PROJECT_ID=flashckard \
CLOUDSQL_INSTANCE=noop-db \
./apps/backend/scripts/setup-cloud-sql-backups.sh
```

This sets daily backups at 03:00 UTC retained 14 days, plus point-in-time
recovery with 7 days of transaction log retention.

Verify:
```sh
gcloud sql backups list --instance=noop-db --project=flashckard
```

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

Wire them to a free monitor:

**Healthchecks.io** (recommended for single-user — free, no auth, easy):
1. Create a check at https://healthchecks.io.
2. Set the check type to "Make HTTP request"; URL =
   `https://api.noop.enform.co/readyz`; method GET; expected 200.
3. Configure email/webhook on failure.

**Better Stack / UptimeRobot** are equivalent free tiers.

**GCP-native**: Cloud Monitoring → Uptime Checks → "noop-readyz" pointing
at the same URL. Free up to 1 check.

## Pool sizing

Defaults are `DB_POOL_MAX=5` for the request pool and `AUTH_DB_POOL_MAX=2`
for the better-auth pool. Cloud Run with `--max-instances=5` gives a
theoretical ceiling of 5 × 7 = 35 simultaneous connections, well under
Cloud SQL Postgres 13's default `max_connections=100`. Bump
`DB_POOL_MAX` only if request latency spikes correlate with pool
saturation (visible as pool wait time in OTEL spans once those land).
