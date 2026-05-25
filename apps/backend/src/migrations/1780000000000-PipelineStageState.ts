import { MigrationInterface, QueryRunner } from "typeorm";

export class PipelineStageState1780000000000 implements MigrationInterface {
  name = 'PipelineStageState1780000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pipeline_stage_state" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" varchar NOT NULL,
        "dayDate" date NOT NULL,
        "stage" varchar(64) NOT NULL,
        "inputFingerprint" text NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'pending',
        "runId" uuid NULL,
        "startedAt" timestamptz NULL,
        "completedAt" timestamptz NULL,
        "durationMs" integer NULL,
        "outputRevision" integer NOT NULL DEFAULT 0,
        "error" text NULL,
        "stats" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "updatedAt" timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT "UQ_pipeline_stage_state_user_day_stage"
          UNIQUE ("userId", "dayDate", "stage")
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "pipeline_stage_state_user_stage_status_idx"
      ON "pipeline_stage_state" ("userId", "stage", "status")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "pipeline_stage_state_stage_updated_idx"
      ON "pipeline_stage_state" ("stage", "updatedAt")
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "pipeline_stage_state_stage_updated_idx"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "pipeline_stage_state_user_stage_status_idx"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "pipeline_stage_state"`)
  }
}
