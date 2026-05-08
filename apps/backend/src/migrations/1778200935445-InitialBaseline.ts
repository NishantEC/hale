import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialBaseline1778200935445 implements MigrationInterface {
    name = 'InitialBaseline1778200935445'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // uuid_generate_v4() lives in uuid-ossp; ensure the extension is loaded
        // before any DDL references it.
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "sleep_plans" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "targetSleepMinutes" integer NOT NULL DEFAULT '480', "wakeMinutes" integer NOT NULL DEFAULT '420', "alarmEnabled" boolean NOT NULL DEFAULT false, "alarmMinutes" integer NOT NULL DEFAULT '420', "smartWakeEnabled" boolean NOT NULL DEFAULT false, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_6931bfa677387f74f145aae4c4a" UNIQUE ("userId"), CONSTRAINT "PK_31b4ed55f516a4f350039e2fed6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "baseline_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "restingHeartRate" double precision NOT NULL DEFAULT '0', "rmssd" double precision NOT NULL DEFAULT '0', "sdnn" double precision NOT NULL DEFAULT '0', "nightsUsed" integer NOT NULL DEFAULT '0', "maxHeartRate" double precision, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_d17e924e32f676e02174614d46e" UNIQUE ("userId"), CONSTRAINT "PK_aa912122682292a750e6a2d4292" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "journal_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "factorTag" character varying NOT NULL, "intensity" integer NOT NULL, "note" text NOT NULL DEFAULT '', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a70368e64230434457c8d007ab3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_91f58b6951701ffb4f9d527f09" ON "journal_entries" ("userId", "timestamp") `);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "devices" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "deviceName" character varying NOT NULL, "strapSerial" character varying, "pairedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b1514758245c12daf43486dd1f0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "signal_samples" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "source" character varying NOT NULL DEFAULT 'strap', "heartRate" double precision, "ibiMs" double precision, "motionScore" double precision, "qualityScore" double precision, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6b8d6491bd90e4b2fd77b513764" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_3e33ed7e30564e6e5cc9c710c7" ON "signal_samples" ("userId", "timestamp") `);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "daily_metrics" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "dayDate" TIMESTAMP WITH TIME ZONE NOT NULL, "stressAverage" double precision, "spo2Average" double precision, "skinTempAvgCelsius" double precision, "skinTempDeltaCelsius" double precision, "strainScore" double precision, "sleepConsistencyScore" double precision, "detectedSleepNights" integer NOT NULL DEFAULT '0', "lfHfRatioAverage" double precision, "recoveryIndex" double precision, "trainingLoadRatio" double precision, "trainingLoadRiskZone" character varying, "spo2DipCount" integer, "odiPerHour" double precision, "lowestSpo2" double precision, "coreTemperatureEstimate" double precision, "circadianNadir" TIMESTAMP WITH TIME ZONE, "sleepArchitectureScore" double precision, "activeMinutes" double precision, "activityCount" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0b33a3faffa5fbb3d4dad78c4e9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_7be65dee4c0ce09d43b184e40c" ON "daily_metrics" ("userId", "dayDate") `);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "daily_scores" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "dayDate" TIMESTAMP WITH TIME ZONE NOT NULL, "dailyBalance" integer NOT NULL DEFAULT '0', "loadPressure" integer NOT NULL DEFAULT '0', "sleepReserveHours" double precision NOT NULL DEFAULT '0', "confidence" character varying NOT NULL DEFAULT 'Low', "recommendation" character varying NOT NULL DEFAULT 'Steady', "detail" text NOT NULL DEFAULT '', "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_2621bc2911847ba54dd43f5b003" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_55e50bb9f89a933b70d1f35c9d" ON "daily_scores" ("userId", "dayDate") `);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "realtime_samples" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "deviceId" character varying NOT NULL, "sessionId" character varying NOT NULL, "dataType" character varying NOT NULL, "heartRate" integer, "rawFields" jsonb, "rawPayload" bytea, "capturedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "receivedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_158f08040c17e191fed4d2fffda" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_e748e834868896d38e1ef39ed3" ON "realtime_samples" ("userId", "sessionId") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_8d52b4596b8fb352bf6996235b" ON "realtime_samples" ("userId", "capturedAt") `);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "device_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "deviceId" character varying NOT NULL, "eventNumber" integer NOT NULL, "eventName" character varying NOT NULL, "rawPayload" bytea, "capturedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "receivedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_808a12fa2283a05c70277d1bfd7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_b87fed7cebe36211ba778eed4a" ON "device_events" ("userId", "capturedAt") `);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "console_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "deviceId" character varying NOT NULL, "message" text NOT NULL, "logLevel" character varying, "metadata" jsonb, "capturedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "receivedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_eba5e3f912b0ccf04cf43a5f5aa" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_4863037fd24c91226aef4b1568" ON "console_logs" ("userId", "capturedAt") `);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "sleep_stages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "nightDate" TIMESTAMP WITH TIME ZONE NOT NULL, "remMinutes" integer NOT NULL DEFAULT '0', "coreMinutes" integer NOT NULL DEFAULT '0', "deepMinutes" integer NOT NULL DEFAULT '0', "awakeMinutes" integer NOT NULL DEFAULT '0', "unknownMinutes" integer NOT NULL DEFAULT '0', "confidence" double precision NOT NULL DEFAULT '0', "source" character varying NOT NULL DEFAULT 'Strap', "epochTimeline" jsonb, "epochMinutes" integer NOT NULL DEFAULT '1', "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_9d33121d6162a0a3147c1c74d9e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_7633787f97766577f0dd9e3392" ON "sleep_stages" ("userId", "nightDate") `);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "sleep_detections" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "nightDate" TIMESTAMP WITH TIME ZONE NOT NULL, "bedtime" TIMESTAMP WITH TIME ZONE, "wakeTime" TIMESTAMP WITH TIME ZONE, "durationHours" double precision NOT NULL DEFAULT '0', "interruptionCount" integer NOT NULL DEFAULT '0', "continuity" double precision NOT NULL DEFAULT '0', "regularity" double precision NOT NULL DEFAULT '0', "validCoverage" double precision NOT NULL DEFAULT '0', "confidence" double precision NOT NULL DEFAULT '0', "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_825d851c5d5f890ba81ab899cbc" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_42fd6f33cb1af2371876bc1f39" ON "sleep_detections" ("userId", "nightDate") `);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "night_features" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "nightDate" TIMESTAMP WITH TIME ZONE NOT NULL, "restingHeartRate" double precision NOT NULL DEFAULT '0', "rmssd" double precision NOT NULL DEFAULT '0', "sdnn" double precision NOT NULL DEFAULT '0', "respiratoryRate" double precision NOT NULL DEFAULT '0', "continuity" double precision NOT NULL DEFAULT '0', "regularity" double precision NOT NULL DEFAULT '0', "validCoverage" double precision NOT NULL DEFAULT '0', "confidenceRaw" double precision NOT NULL DEFAULT '0', "sleepEstimateHours" double precision NOT NULL DEFAULT '0', "sourceBlend" character varying NOT NULL DEFAULT 'Unknown', "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ffd6afc3a3ba139b71b43332ceb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_6bc98cb10bf7c6a1197d7dbbf1" ON "night_features" ("userId", "nightDate") `);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "raw_sensor_records" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "heartRate" double precision NOT NULL DEFAULT '0', "rrAverageMs" double precision, "spo2Red" double precision, "spo2IR" double precision, "skinTempRaw" double precision, "gravityMagnitude" double precision, "gravityX" double precision, "gravityY" double precision, "gravityZ" double precision, "respRateRaw" double precision, "skinContact" boolean, "ppgGreen" double precision, "ppgRedIr" double precision, "ambientLight" double precision, "ledDrive1" double precision, "ledDrive2" double precision, "signalQuality" double precision, CONSTRAINT "PK_f2f1e33641adf66f4450bc6f5fa" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_604f57001596ee68b1ff741b34" ON "raw_sensor_records" ("userId", "timestamp") `);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "imu_records" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "accelX" double precision NOT NULL, "accelY" double precision NOT NULL, "accelZ" double precision NOT NULL, "gyroX" double precision NOT NULL, "gyroY" double precision NOT NULL, "gyroZ" double precision NOT NULL, "source" character varying NOT NULL DEFAULT 'realtime', CONSTRAINT "PK_2f92274ebe4d68791ae7cead2c6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_1c0f24315a34c073e4197546ea" ON "imu_records" ("userId", "timestamp") `);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "activity_detections" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "startTime" TIMESTAMP WITH TIME ZONE NOT NULL, "endTime" TIMESTAMP WITH TIME ZONE NOT NULL, "durationMinutes" double precision NOT NULL, "activityType" character varying NOT NULL, "intensity" character varying NOT NULL, "confidence" double precision NOT NULL, "heartRateAvg" double precision NOT NULL, "heartRateMax" double precision NOT NULL, "strainScore" double precision NOT NULL, "cadenceHz" double precision, "source" character varying NOT NULL DEFAULT 'detected', "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ff7165b088a54a35fc40421424b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_53ff195706d9e9b880d53b88b0" ON "activity_detections" ("userId", "startTime") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_53ff195706d9e9b880d53b88b0"`);
        await queryRunner.query(`DROP TABLE "activity_detections"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1c0f24315a34c073e4197546ea"`);
        await queryRunner.query(`DROP TABLE "imu_records"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_604f57001596ee68b1ff741b34"`);
        await queryRunner.query(`DROP TABLE "raw_sensor_records"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6bc98cb10bf7c6a1197d7dbbf1"`);
        await queryRunner.query(`DROP TABLE "night_features"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_42fd6f33cb1af2371876bc1f39"`);
        await queryRunner.query(`DROP TABLE "sleep_detections"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7633787f97766577f0dd9e3392"`);
        await queryRunner.query(`DROP TABLE "sleep_stages"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4863037fd24c91226aef4b1568"`);
        await queryRunner.query(`DROP TABLE "console_logs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b87fed7cebe36211ba778eed4a"`);
        await queryRunner.query(`DROP TABLE "device_events"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8d52b4596b8fb352bf6996235b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e748e834868896d38e1ef39ed3"`);
        await queryRunner.query(`DROP TABLE "realtime_samples"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_55e50bb9f89a933b70d1f35c9d"`);
        await queryRunner.query(`DROP TABLE "daily_scores"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7be65dee4c0ce09d43b184e40c"`);
        await queryRunner.query(`DROP TABLE "daily_metrics"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3e33ed7e30564e6e5cc9c710c7"`);
        await queryRunner.query(`DROP TABLE "signal_samples"`);
        await queryRunner.query(`DROP TABLE "devices"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_91f58b6951701ffb4f9d527f09"`);
        await queryRunner.query(`DROP TABLE "journal_entries"`);
        await queryRunner.query(`DROP TABLE "baseline_profiles"`);
        await queryRunner.query(`DROP TABLE "sleep_plans"`);
    }

}
