import { MigrationInterface, QueryRunner } from 'typeorm';

export class channelsUsersLastMsg1571043713601 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE channels_users
      ADD COLUMN IF NOT EXISTS "last_msg" varchar(255) NULL,
      ADD COLUMN IF NOT EXISTS "last_msg_at" date NULL;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE channels_users DROP COLUMN IF EXISTS "last_msg", DROP COLUMN last_msg_at IF EXISTS "last_msg_at";`,
    );
  }
}
