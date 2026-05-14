import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommandResponses_1779600000000 implements MigrationInterface {
  name = 'CommandResponses_1779600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "command_responses" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" character varying NOT NULL,
        "deviceId" character varying NOT NULL,
        "command" int NOT NULL,
        "commandName" character varying NOT NULL,
        "sequence" int NOT NULL,
        "rawPayload" bytea,
        "capturedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "receivedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_command_responses" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_command_responses_userId_capturedAt" ON "command_responses" ("userId", "capturedAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_command_responses_userId_capturedAt"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "command_responses"`);
  }
}
