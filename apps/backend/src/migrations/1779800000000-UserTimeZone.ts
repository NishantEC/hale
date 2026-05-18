import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a `timeZone` IANA string to the Better Auth `user` table. We use it
 * as a per-user fallback when a pipeline run lands without an explicit
 * `?timeZone=` query param — previously this defaulted to UTC, which left
 * `daily_metrics.dayDate` aligned to UTC midnight (05:30 IST), wrong for
 * IST users. The column is nullable; runs without a stored TZ still fall
 * back to UTC.
 */
export class UserTimeZone_1779800000000 implements MigrationInterface {
  name = 'UserTimeZone_1779800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "timeZone" varchar`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "timeZone"`);
  }
}
