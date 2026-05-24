import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds lease + heartbeat tracking to pipeline_runs so the new Rust
 * worker (apps/compute-engine/src/bin/worker.rs) can safely claim a
 * run, prove it is still alive, and let a stale-row sweeper recover
 * from worker death.
 *
 *   heartbeatAt   — bumped by the worker every ~30s while running.
 *                   NULL until first beat; NULL again on terminal status.
 *   leaseId       — unique-per-attempt token. Lets a second worker (or
 *                   a retry from Cloud Tasks) detect "someone else owns
 *                   this run" via compare-and-swap on the row update.
 *   workerSource  — 'nest-in-process' | 'rust-worker'. Observability
 *                   during the Phase B migration so we can see which
 *                   stages have flipped over.
 *
 * Stale-run recovery (runs in NestJS as a cron):
 *   UPDATE pipeline_runs
 *   SET status='failed', error='heartbeat timeout', completedAt=now()
 *   WHERE status='running' AND heartbeatAt < now() - interval '5 minutes';
 *
 * Without this, a Cloud Run instance dying mid-run leaves the row stuck
 * at status='running', the dedupe partial index blocks any future run
 * for that user, and the user is stranded until the row is manually
 * cleared.
 */
export class PipelineRunLeaseHeartbeat1779900000000
  implements MigrationInterface
{
  name = 'PipelineRunLeaseHeartbeat1779900000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pipeline_runs"
      ADD COLUMN IF NOT EXISTS "heartbeatAt" timestamptz NULL
    `)
    await queryRunner.query(`
      ALTER TABLE "pipeline_runs"
      ADD COLUMN IF NOT EXISTS "leaseId" varchar(64) NULL
    `)
    await queryRunner.query(`
      ALTER TABLE "pipeline_runs"
      ADD COLUMN IF NOT EXISTS "workerSource" varchar(32) NULL
    `)
    // Index for the stale-run sweeper.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "pipeline_runs_running_heartbeat_idx"
      ON "pipeline_runs" ("heartbeatAt")
      WHERE "status" = 'running'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "pipeline_runs_running_heartbeat_idx"`,
    )
    await queryRunner.query(
      `ALTER TABLE "pipeline_runs" DROP COLUMN IF EXISTS "workerSource"`,
    )
    await queryRunner.query(
      `ALTER TABLE "pipeline_runs" DROP COLUMN IF EXISTS "leaseId"`,
    )
    await queryRunner.query(
      `ALTER TABLE "pipeline_runs" DROP COLUMN IF EXISTS "heartbeatAt"`,
    )
  }
}
