import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds async-job state to pipeline_runs so /pipeline/run can return
 * 202 + runId immediately and clients poll for completion (codex
 * adversarial review 2026-05-21, finding #3). Before this, the route
 * was a synchronous HTTP request that could hang Cloud Run for up to
 * 25 min on the JS fallback path while the mobile client timed out
 * after 300 s — encouraging retries and 503 storms.
 *
 * Columns:
 *   status        — 'queued' / 'running' / 'succeeded' / 'failed'
 *   completedAt   — terminal-state timestamp, NULL while running
 *   error         — short error message on 'failed', else NULL
 *
 * Existing rows pre-date the async path; backfill them with
 * status='succeeded' since they only land on completion today.
 */
export class PipelineRunAsyncStatus1779600000000
  implements MigrationInterface
{
  name = 'PipelineRunAsyncStatus1779600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pipeline_runs"
      ADD COLUMN IF NOT EXISTS "status" varchar(16) NOT NULL DEFAULT 'succeeded'
    `)
    await queryRunner.query(`
      ALTER TABLE "pipeline_runs"
      ADD COLUMN IF NOT EXISTS "completedAt" timestamptz NULL
    `)
    await queryRunner.query(`
      ALTER TABLE "pipeline_runs"
      ADD COLUMN IF NOT EXISTS "error" text NULL
    `)
    // Backfill: existing rows were only inserted on completion, so they
    // map to status='succeeded' and completedAt=startedAt+durationMs.
    await queryRunner.query(`
      UPDATE "pipeline_runs"
      SET "completedAt" = "startedAt" + ("durationMs" || ' milliseconds')::interval
      WHERE "completedAt" IS NULL
    `)
    // Partial index for the "is there an in-progress run for this user?"
    // query the controller uses to dedupe concurrent POSTs.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "pipeline_runs_user_inflight_idx"
      ON "pipeline_runs" ("userId")
      WHERE "status" IN ('queued','running')
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "pipeline_runs_user_inflight_idx"`,
    )
    await queryRunner.query(
      `ALTER TABLE "pipeline_runs" DROP COLUMN IF EXISTS "error"`,
    )
    await queryRunner.query(
      `ALTER TABLE "pipeline_runs" DROP COLUMN IF EXISTS "completedAt"`,
    )
    await queryRunner.query(
      `ALTER TABLE "pipeline_runs" DROP COLUMN IF EXISTS "status"`,
    )
  }
}
