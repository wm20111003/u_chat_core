import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 新增`channel_ban_member`枚举值
 */
export class MessagesType1571306594522 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`
			ALTER TYPE "public"."messages_type_enum" RENAME TO "messages_type_enum_old";
			CREATE TYPE "messages_type_enum" AS ENUM('text', 'image', 'join_room', 'join_room_invite', 'join_room_qrcode', 'leave_room', 'friend_accept_me', 'i_accept_friend', 'friend_request', 'non_friend_warning', 'complaint_reply', 'channel_name_changed', 'channel_owner_invite_only_changed', 'channel_banned_changed', 'channel_ban_member', 'channel_member_masked_changed', 'system');
			ALTER TABLE "messages" ALTER COLUMN "type" DROP DEFAULT;
			ALTER TABLE "messages" ALTER COLUMN "type" TYPE "messages_type_enum" USING "type"::"text"::"messages_type_enum";
			ALTER TABLE "messages" ALTER COLUMN "type" SET DEFAULT 'text';
			DROP TYPE "messages_type_enum_old";
			COMMENT ON COLUMN "messages"."type" IS '类型';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`
			ALTER TYPE "public"."messages_type_enum" RENAME TO "messages_type_enum_old";
			CREATE TYPE "messages_type_enum" AS ENUM('text', 'image', 'join_room', 'join_room_invite', 'join_room_qrcode', 'leave_room', 'friend_accept_me', 'i_accept_friend', 'friend_request', 'non_friend_warning', 'complaint_reply', 'channel_name_changed', 'channel_owner_invite_only_changed', 'channel_banned_changed', 'channel_member_masked_changed', 'system');
			ALTER TABLE "messages" ALTER COLUMN "type" DROP DEFAULT;
			ALTER TABLE "messages" ALTER COLUMN "type" TYPE "messages_type_enum" USING "type"::"text"::"messages_type_enum";
			ALTER TABLE "messages" ALTER COLUMN "type" SET DEFAULT 'text';
			DROP TYPE "messages_type_enum_old";
			COMMENT ON COLUMN "messages"."type" IS '类型';
		`);
  }
}
