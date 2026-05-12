import { MigrationInterface, QueryRunner } from "typeorm";

// Extends pipeline_runs with the window the run targeted plus a `forced`
// flag (watermark bypassed). Feeds the inspector's history chart so each
// bar can show whether it was a full 45-day recompute, a single-day
// targeted rerun, or an explicit force.

export class PipelineRunWindow_1779400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pipeline_runs"
      ADD COLUMN IF NOT EXISTS "windowFrom" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "windowTo" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "forced" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pipeline_runs"
      DROP COLUMN IF EXISTS "forced",
      DROP COLUMN IF EXISTS "windowTo",
      DROP COLUMN IF EXISTS "windowFrom"
    `);
  }
}
