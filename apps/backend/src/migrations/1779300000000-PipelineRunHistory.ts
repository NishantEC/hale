import { MigrationInterface, QueryRunner } from "typeorm";

// Per-run history for /pipeline/run — feeds the inspector's regression
// watch. The aggregate pipeline_state holds only the latest run; this
// table is append-only and exposes stage-timing drift over time.

export class PipelineRunHistory_1779300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pipeline_runs" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" varchar NOT NULL,
        "startedAt" timestamptz NOT NULL,
        "durationMs" integer NOT NULL,
        "skipped" boolean NOT NULL DEFAULT false,
        "stages" jsonb NULL,
        "detections" integer NOT NULL DEFAULT 0,
        "sleepStages" integer NOT NULL DEFAULT 0,
        "features" integer NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pipeline_runs_userId_startedAt"
      ON "pipeline_runs" ("userId", "startedAt" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_pipeline_runs_userId_startedAt"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "pipeline_runs"`);
  }
}
