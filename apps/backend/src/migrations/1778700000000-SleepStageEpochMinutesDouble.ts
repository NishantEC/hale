import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Sleep stages use 30-second epochs (EPOCH_MINUTES = 0.5). Storing this in
 * an int column was silently truncating to 0, which broke the hypnogram's
 * width scaling. Convert to double precision so the classifier can persist
 * the actual epoch length.
 */
export class SleepStageEpochMinutesDouble1778700000000
  implements MigrationInterface
{
  name = 'SleepStageEpochMinutesDouble1778700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sleep_stages
      ALTER COLUMN "epochMinutes" TYPE double precision
      USING "epochMinutes"::double precision
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sleep_stages
      ALTER COLUMN "epochMinutes" TYPE int
      USING "epochMinutes"::int
    `);
  }
}
