import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChannelAddRole1577601178921 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'channels_users_role_enum') THEN
              CREATE TYPE "channels_users_role_enum" AS ENUM('owner', 'manager', 'member');
          END IF;
      END$$;`,
    );
    await queryRunner.query(
      `ALTER TABLE "channels_users" ADD COLUMN IF NOT EXISTS "role" "channels_users_role_enum" NOT NULL DEFAULT 'member'`,
    );
    // 数据清洗
    await queryRunner.query(
      `UPDATE channels_users SET "role" = 'owner' WHERE "id" in
          (SELECT "a"."id" FROM channels_users "a" INNER JOIN channels "b" on "a".channel_id = "b"."id" WHERE "a".user_id="b".owner_id and "b"."type"='g')`,
    );
    // 语言纠正
    await queryRunner.query(
      `UPDATE users SET "locale" = 'zh-CN' WHERE "locale" = 'zh'`,
    );
    await queryRunner.query(
      `UPDATE users SET "locale" = 'en' WHERE "locale" = 'English'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`ALTER TABLE "channels_users" DROP "role"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "channels_users_role_enum"`);
  }
}
