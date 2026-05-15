import { MigrationInterface, QueryRunner } from 'typeorm';

export class ActivityConfirmation_1779700000000 implements MigrationInterface {
  name = 'ActivityConfirmation_1779700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "activity_detections" ADD COLUMN IF NOT EXISTS "userConfirmedType" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_detections" ADD COLUMN IF NOT EXISTS "dismissedAt" timestamptz`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "activity_detections" DROP COLUMN IF EXISTS "userConfirmedType"`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_detections" DROP COLUMN IF EXISTS "dismissedAt"`,
    );
  }
}
