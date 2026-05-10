import { MigrationInterface, QueryRunner } from "typeorm";

export class ActivityDetectionHealthkitFields1778500000000 implements MigrationInterface {
  name = 'ActivityDetectionHealthkitFields1778500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "activity_detections" ADD COLUMN IF NOT EXISTS "flightsCount" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_detections" ADD COLUMN IF NOT EXISTS "elevationGainMeters" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_detections" ADD COLUMN IF NOT EXISTS "distanceMeters" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_detections" ADD COLUMN IF NOT EXISTS "externalSource" character varying`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "healthkit_daily_summaries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" character varying NOT NULL,
        "dayDate" date NOT NULL,
        "steps" integer,
        "activeEnergyKcal" double precision,
        "exerciseMinutes" double precision,
        "standMinutes" double precision,
        "walkingDistanceMeters" double precision,
        "flightsClimbed" integer,
        "restingHeartRate" double precision,
        "hrvSdnnMs" double precision,
        "oxygenSaturationAverage" double precision,
        "respiratoryRateAverage" double precision,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_healthkit_daily_summaries" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_healthkit_daily_summaries_user_day" UNIQUE ("userId", "dayDate")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_healthkit_daily_summaries_user_day" ON "healthkit_daily_summaries" ("userId", "dayDate")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "healthkit_workouts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" character varying NOT NULL,
        "uuid" character varying NOT NULL,
        "activityName" character varying NOT NULL,
        "startTime" TIMESTAMP WITH TIME ZONE NOT NULL,
        "endTime" TIMESTAMP WITH TIME ZONE NOT NULL,
        "durationMinutes" double precision NOT NULL,
        "totalEnergyKcal" double precision,
        "totalDistanceMeters" double precision,
        "averageHeartRate" double precision,
        "appleSource" character varying,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_healthkit_workouts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_healthkit_workouts_user_uuid" UNIQUE ("userId", "uuid")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_healthkit_workouts_user_start" ON "healthkit_workouts" ("userId", "startTime")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "barometer_samples" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" character varying NOT NULL,
        "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL,
        "pressureHpa" double precision NOT NULL,
        "relativeAltitudeMeters" double precision,
        CONSTRAINT "PK_barometer_samples" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_barometer_samples_user_ts" ON "barometer_samples" ("userId", "timestamp")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "motion_activity_samples" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" character varying NOT NULL,
        "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL,
        "activity" character varying NOT NULL,
        "confidence" character varying NOT NULL,
        CONSTRAINT "PK_motion_activity_samples" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_motion_activity_samples_user_ts" ON "motion_activity_samples" ("userId", "timestamp")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_motion_activity_samples_user_ts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "motion_activity_samples"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_barometer_samples_user_ts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "barometer_samples"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_healthkit_workouts_user_start"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "healthkit_workouts"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_healthkit_daily_summaries_user_day"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "healthkit_daily_summaries"`);
    await queryRunner.query(`ALTER TABLE "activity_detections" DROP COLUMN IF EXISTS "externalSource"`);
    await queryRunner.query(`ALTER TABLE "activity_detections" DROP COLUMN IF EXISTS "distanceMeters"`);
    await queryRunner.query(`ALTER TABLE "activity_detections" DROP COLUMN IF EXISTS "elevationGainMeters"`);
    await queryRunner.query(`ALTER TABLE "activity_detections" DROP COLUMN IF EXISTS "flightsCount"`);
  }
}
