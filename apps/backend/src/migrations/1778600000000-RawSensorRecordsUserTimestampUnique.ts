import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds a UNIQUE(userId, timestamp) constraint on raw_sensor_records and
 * cleans up the historical multi-row-per-timestamp corruption that
 * accumulated before the parser/dedupe fixes shipped.
 *
 * For each (userId, timestamp) bucket we keep ONE row — preferring the
 * row with real sensor data ("gravityMagnitude" > 0) over the all-zero
 * generic-packet rows. Among real rows we keep the highest "signalQuality"
 * (or the lowest id ULID if tied). All other rows for that timestamp are
 * deleted.
 */
export class RawSensorRecordsUserTimestampUnique1778600000000
  implements MigrationInterface
{
  name = 'RawSensorRecordsUserTimestampUnique1778600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1 — pick a winner per (userId, timestamp) and delete the rest.
    // Winner ranking:
    //   1. has real gravity reading (gravityMagnitude IS NOT NULL AND > 0)
    //   2. signalQuality DESC NULLS LAST
    //   3. heart_rate in 30..250 (rejects HR=6 junk)
    //   4. id ASC (deterministic tiebreak)
    await queryRunner.query(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY "userId", timestamp
            ORDER BY
              (CASE WHEN "gravityMagnitude" IS NOT NULL AND "gravityMagnitude" > 0 THEN 0 ELSE 1 END),
              (CASE WHEN "heartRate" BETWEEN 30 AND 250 THEN 0 ELSE 1 END),
              "signalQuality" DESC NULLS LAST,
              id ASC
          ) AS rn
        FROM raw_sensor_records
      )
      DELETE FROM raw_sensor_records
      WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
    `);

    // Step 2 — scrub junk HR values from surviving rows. Strap occasionally
    // emits non-HR bytes (HR=6, HR=10) when an unusual packet format slips
    // through. Resting HR floor is 30 bpm; max is 250.
    await queryRunner.query(`
      UPDATE raw_sensor_records
      SET "heartRate" = 0
      WHERE "heartRate" > 0 AND ("heartRate" < 30 OR "heartRate" > 250)
    `);

    // Step 3 — add the unique constraint
    await queryRunner.query(`
      ALTER TABLE raw_sensor_records
      ADD CONSTRAINT raw_sensor_records_user_ts_unique
      UNIQUE ("userId", timestamp)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE raw_sensor_records
      DROP CONSTRAINT IF EXISTS raw_sensor_records_user_ts_unique
    `);
  }
}
