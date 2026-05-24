import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Per-day input fingerprint table — the foundation of per-day
 * idempotency in the new Rust pipeline worker.
 *
 * Today the pipeline re-derives every day in the 45-day window on
 * every run because the only short-circuit (`pipeline_state.lastInputMaxUpdatedAt`)
 * is global: if any raw row in the window has a fresher `updatedAt`,
 * the entire window is re-computed.
 *
 * pipeline_day_state stores `rawMaxUpdatedAt` per (userId, dayDate).
 * The worker:
 *   1. SELECTs max("updatedAt") from raw_sensor_records grouped by
 *      timezone-local day in the run window.
 *   2. Compares each day's new max against the stored value.
 *   3. Re-derives only the days whose fingerprint advanced.
 *   4. Bumps `lastComputedAt` + `computedRevision` after a successful
 *      re-derive for that day.
 *
 * dayDate is stored as a calendar date string (YYYY-MM-DD) in the
 * user's timezone — mirrors the convention already used by
 * daily_scores / daily_metrics / night_features so reasoning across
 * tables stays consistent.
 */
export class PipelineDayState1779950000000 implements MigrationInterface {
  name = 'PipelineDayState1779950000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pipeline_day_state" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" varchar NOT NULL,
        "dayDate" date NOT NULL,
        "rawMaxUpdatedAt" timestamptz NULL,
        "lastComputedAt" timestamptz NULL,
        "computedRevision" integer NOT NULL DEFAULT 0,
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_pipeline_day_state_user_day" UNIQUE ("userId", "dayDate")
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "pipeline_day_state_user_day_idx"
      ON "pipeline_day_state" ("userId", "dayDate")
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "pipeline_day_state_user_day_idx"`,
    )
    await queryRunner.query(`DROP TABLE IF EXISTS "pipeline_day_state"`)
  }
}
