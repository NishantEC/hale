import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add noop demographic columns directly to the Better Auth `user` table
 * (singular, per Better Auth's default schema). These are surfaced as
 * additionalFields in the auth config so the Better Auth client can
 * read/write them with type safety, but TypeORM never sees the user
 * table — we use raw SQL.
 *
 * Also drops the temporary `user_profiles` table created in
 * 1779000000000-HealthspanFoundation. health_assessments stays.
 */
export class UserDemographicFields_1779100000000 implements MigrationInterface {
  name = 'UserDemographicFields_1779100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Better Auth's table is named "user" (singular) — quote it because
    // user is a reserved word in Postgres.
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "dateOfBirth" date`);
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "biologicalSex" varchar`);
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "heightCm" double precision`);
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "weightKg" double precision`);

    // Drop the unused user_profiles table — replaced by columns on user.
    await queryRunner.query(`DROP TABLE IF EXISTS "user_profiles"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_profiles" (
        "id"            uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId"        varchar NOT NULL,
        "dateOfBirth"   date,
        "biologicalSex" varchar,
        "heightCm"      double precision,
        "weightKg"      double precision,
        "createdAt"     TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_user_profiles_userId" UNIQUE ("userId"),
        CONSTRAINT "PK_user_profiles" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "weightKg"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "heightCm"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "biologicalSex"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "dateOfBirth"`);
  }
}
