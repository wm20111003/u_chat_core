import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChannelsUserBanned1571025471422 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "channels_users" ADD COLUMN IF NOT EXISTS "banned" boolean DEFAULT 'false'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "channels_users" DROP COLUMN "banned"`,
    );
  }
}
