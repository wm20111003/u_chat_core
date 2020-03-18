import { MigrationInterface, QueryRunner } from 'typeorm';

export class MesssageTpye1577526965528 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`
      ALTER TYPE "public"."messages_type_enum" RENAME TO "messages_type_enum_old";
      CREATE TYPE "messages_type_enum" AS ENUM('text', 'image', 'audio', 'join_room', 'join_room_invite', 'join_room_qrcode', 'join_room_link', 'leave_room', 'friend_accept_me', 'i_accept_friend', 'friend_request', 'non_friend_warning', 'complaint_reply', 'channel_name_changed', 'channel_owner_invite_only_changed', 'channel_banned_changed', 'channel_ban_member', 'channel_member_masked_changed', 'contact_card', 'contain_at', 'withdraw_by_group_owner', 'withdraw_by_sender', 'system');
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
      CREATE TYPE "messages_type_enum" AS ENUM('text', 'image', 'audio', 'join_room', 'join_room_invite', 'join_room_qrcode', 'join_room_link', 'leave_room', 'friend_accept_me', 'i_accept_friend', 'friend_request', 'non_friend_warning', 'complaint_reply', 'channel_name_changed', 'channel_owner_invite_only_changed', 'channel_banned_changed', 'channel_ban_member', 'channel_member_masked_changed', 'withdraw_by_group_owner', 'withdraw_by_sender', 'system');;
      ALTER TABLE "messages" ALTER COLUMN "type" DROP DEFAULT;
      ALTER TABLE "messages" ALTER COLUMN "type" TYPE "messages_type_enum" USING "type"::"text"::"messages_type_enum";
      ALTER TABLE "messages" ALTER COLUMN "type" SET DEFAULT 'text';
      DROP TYPE "messages_type_enum_old";
      COMMENT ON COLUMN "messages"."type" IS '类型';
    `);
  }
}
