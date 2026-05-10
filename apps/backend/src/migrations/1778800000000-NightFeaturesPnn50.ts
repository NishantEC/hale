import { MigrationInterface, QueryRunner } from "typeorm";

export class NightFeaturesPnn50_1778800000000 implements MigrationInterface {
  name = 'NightFeaturesPnn50_1778800000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "night_features" ADD COLUMN IF NOT EXISTS "pnn50" double precision`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "night_features" DROP COLUMN IF EXISTS "pnn50"`,
    );
  }
}
