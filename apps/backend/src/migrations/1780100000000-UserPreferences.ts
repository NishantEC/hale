import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `user_preferences` is a one-row-per-user key/value bag for settings the
 * app needs to round-trip but doesn't deserve its own typed column. JSON
 * payload keeps schema migrations off the critical path while we figure
 * out which preferences earn promotion to typed fields.
 *
 * Examples of what lives here: notification opt-ins, goal overrides
 * (sleep target, strain target), hidden-metric toggles, journal-reminder
 * cadence.
 */
export class UserPreferences_1780100000000 implements MigrationInterface {
  name = 'UserPreferences_1780100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_preferences" (
        "userId" varchar PRIMARY KEY,
        "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_preferences"`);
  }
}
