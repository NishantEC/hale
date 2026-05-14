import { MigrationInterface, QueryRunner } from 'typeorm';

export class DailyScoreSleepScore_1779500000000 implements MigrationInterface {
  name = 'DailyScoreSleepScore_1779500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "daily_scores" ADD COLUMN IF NOT EXISTS "sleepScore" int`,
    );

    // Opportunistic backfill so days that scored before this column
    // existed don't render as "--" in the sleep ring. Pull the trailing
    // ", Sleep score N" substring the pipeline used to append to
    // `detail` and lift it into the typed column. Anything that doesn't
    // match stays null and will be filled on the next pipeline run.
    await queryRunner.query(
      `UPDATE "daily_scores"
         SET "sleepScore" = CAST(substring("detail" FROM ', Sleep score ([0-9]+)') AS int)
       WHERE "sleepScore" IS NULL
         AND "detail" ~ ', Sleep score [0-9]+'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "daily_scores" DROP COLUMN IF EXISTS "sleepScore"`,
    );
  }
}
