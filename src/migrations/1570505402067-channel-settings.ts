import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChannelSettings1570505402067 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "settings" jsonb DEFAULT '{"ownerInviteOnly": false, "banned": false, "memberMasked": false}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`ALTER TABLE channels DROP COLUMN settings`);
  }
}
