import { MigrationInterface, QueryRunner } from 'typeorm';

export class HealthspanFoundation_1779000000000
  implements MigrationInterface
{
  name = 'HealthspanFoundation_1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // noop-specific demographic profile keyed by Better Auth userId.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_profiles" (
        "id"               uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId"           character varying NOT NULL,
        "dateOfBirth"      date,
        "biologicalSex"    character varying,
        "heightCm"         double precision,
        "weightKg"         double precision,
        "createdAt"        TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"        TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_user_profiles_userId" UNIQUE ("userId"),
        CONSTRAINT "PK_user_profiles" PRIMARY KEY ("id")
      )
    `);

    // Weekly Healthspan assessment. Refreshed when a week boundary
    // crosses during a pipeline run.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "health_assessments" (
        "id"               uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId"           character varying NOT NULL,
        "weekStart"        date NOT NULL,
        "chronologicalAge" double precision NOT NULL,
        "noopAge"          double precision NOT NULL,
        "paceOfAging"      double precision,
        "contributors"     jsonb NOT NULL DEFAULT '[]'::jsonb,
        "coachingTitle"    character varying,
        "coachingBody"     text,
        "generatedAt"      TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_health_assessments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_health_assessments_userId_weekStart"
          UNIQUE ("userId", "weekStart")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_health_assessments_userId_weekStart"
       ON "health_assessments" ("userId", "weekStart" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_health_assessments_userId_weekStart"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "health_assessments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_profiles"`);
  }
}
