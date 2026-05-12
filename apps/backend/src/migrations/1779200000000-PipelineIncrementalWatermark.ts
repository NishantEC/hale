import { MigrationInterface, QueryRunner } from "typeorm";

// Incremental-pipeline watermark: a per-user table that records the
// max(updatedAt) across raw_sensor_records + signal_samples at the time
// of the last successful runPipeline. Future runs query the current max
// and short-circuit when nothing has advanced.
//
// Also adds an updatedAt column to raw_sensor_records (signal_samples
// already has one via @UpdateDateColumn) plus an index on (userId,
// updatedAt) for fast MAX() lookups.

export class PipelineIncrementalWatermark_1779200000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "raw_sensor_records"
      ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT NOW()
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_raw_sensor_records_userId_updatedAt"
      ON "raw_sensor_records" ("userId", "updatedAt")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pipeline_state" (
        "userId" varchar PRIMARY KEY,
        "lastRunAt" timestamptz NOT NULL,
        "lastInputMaxUpdatedAt" timestamptz NULL,
        "lastRunDurationMs" integer NOT NULL DEFAULT 0
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pipeline_state"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_raw_sensor_records_userId_updatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "raw_sensor_records" DROP COLUMN IF EXISTS "updatedAt"`,
    );
  }
}
