import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds UNIQUE constraints on the derived day/night tables so concurrent
 * pipeline runs can't insert duplicates (codex adversarial review
 * 2026-05-21, finding #5). Before this, the non-unique composite index
 * on (userId, dayDate/nightDate) let two parallel /pipeline/run requests
 * both read no existing row, both insert, and leave a duplicate that the
 * later self-heal had to clean up on read.
 *
 * The unique constraint pairs with INSERT ... ON CONFLICT DO UPDATE in
 * pipeline.service.ts so the writes become idempotent.
 *
 * Pre-clean step: dedupe any existing duplicates by keeping the most
 * recently updated row per (userId, dayDate/nightDate). Mirrors the
 * approach used in RawSensorRecordsUserTimestampUnique.
 */
export class DerivedTablesUniqueDayNight1779500000000
  implements MigrationInterface
{
  name = 'DerivedTablesUniqueDayNight1779500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1 — per-table dedupe. Keep the row with the newest updatedAt.
    const tables: Array<{
      name: string
      dateCol: 'dayDate' | 'nightDate'
      updatedCol: string
    }> = [
      { name: 'daily_metrics', dateCol: 'dayDate', updatedCol: 'updatedAt' },
      { name: 'daily_scores', dateCol: 'dayDate', updatedCol: 'updatedAt' },
      { name: 'sleep_detections', dateCol: 'nightDate', updatedCol: 'updatedAt' },
      { name: 'sleep_stages', dateCol: 'nightDate', updatedCol: 'updatedAt' },
      { name: 'night_features', dateCol: 'nightDate', updatedCol: 'updatedAt' },
    ]

    for (const t of tables) {
      await queryRunner.query(`
        WITH ranked AS (
          SELECT id,
            ROW_NUMBER() OVER (
              PARTITION BY "userId", "${t.dateCol}"
              ORDER BY "${t.updatedCol}" DESC NULLS LAST, id ASC
            ) AS rn
          FROM "${t.name}"
        )
        DELETE FROM "${t.name}"
        WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
      `)

      await queryRunner.query(`
        ALTER TABLE "${t.name}"
        ADD CONSTRAINT "${t.name}_user_${t.dateCol}_unique"
        UNIQUE ("userId", "${t.dateCol}")
      `)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables: Array<{ name: string; dateCol: string }> = [
      { name: 'daily_metrics', dateCol: 'dayDate' },
      { name: 'daily_scores', dateCol: 'dayDate' },
      { name: 'sleep_detections', dateCol: 'nightDate' },
      { name: 'sleep_stages', dateCol: 'nightDate' },
      { name: 'night_features', dateCol: 'nightDate' },
    ]
    for (const t of tables) {
      await queryRunner.query(`
        ALTER TABLE "${t.name}"
        DROP CONSTRAINT IF EXISTS "${t.name}_user_${t.dateCol}_unique"
      `)
    }
  }
}
