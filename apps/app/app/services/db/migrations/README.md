# On-device migrations

Drizzle ORM + `@op-engineering/op-sqlite`. The migrator (`runMigrations()` in
`../index.ts`) runs every app launch and tracks applied migrations in a hidden
`__drizzle_migrations` table inside `noop.db`.

## Rules

1. **Never edit a migration that has been committed/shipped.** Drizzle
   identifies migrations by their tag (`0000_init`, `0001_repair_schema`, …).
   If a tag is already in `__drizzle_migrations__`, the migrator will skip it
   regardless of how its contents change. Devices that ran the old version
   will silently miss the edit.

2. **Each schema change ⇒ a new migration file.** Bump the index, write a new
   `.sql`, and add a matching `m####` import + journal entry to `migrations.js`.
   The pair must stay in sync. `.sql` files are inlined into the JS bundle at
   build time via `babel-plugin-inline-import` (see `babel.config.js`).

3. **Prefer idempotent statements** (`CREATE TABLE IF NOT EXISTS`, `CREATE
   INDEX IF NOT EXISTS`, defensive `DROP IF EXISTS` before `CREATE`). This
   keeps recovery migrations cheap to write and safe to run on devices in
   unexpected states.

4. **Migration failures must surface.** `app.tsx` shows an `Alert` with
   "Retry" and "Reset local data" buttons on failure. Don't change that to
   silently mark `isDbReady=true` — the app will load and crash later on
   missing tables/columns instead of giving the user a path out.

## Recovery migration: `0001_repair_schema.sql`

Exists because an earlier ship of the app installed a slimmer `0000_init`
that didn't include `raw_sensor_records` and `view_cache`. Devices on that
build had `0000_init` marked applied; later edits to the file didn't re-run.
`0001_repair_schema` re-creates every table with `IF NOT EXISTS` so those
devices recover on next launch. No-op on healthy DBs.

## Adding a migration

1. Edit `../schema.ts` (Drizzle TS schema).
2. Generate the SQL: `pnpm --filter app drizzle-kit generate` (or follow
   `scripts/generate-migrations.sh`). This produces a new `####_*.sql` file
   plus a `meta/####_snapshot.json`.
3. Wire it into `migrations.js`:
   - Add `import m#### from './####_*.sql'` at the top.
   - Add the new `m####` to the exported `migrations` object.
   - Add a matching entry to `meta/_journal.json` with the next `idx` and a
     `when` timestamp strictly greater than every prior entry's `when`. The
     migrator skips any migration whose `when` is `<=` the last-applied
     `created_at`, so a regressed `when` silently disables that migration on
     every device that already ran a later one. drizzle-kit's `generate`
     usually picks a monotonic value, but verify before committing — handwritten
     entries are the usual culprit.
4. Test on a device that already has the previous schema (don't just test on
   a fresh install — that masks the exact bug this README exists to prevent).
