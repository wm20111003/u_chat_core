import { MigrationInterface, QueryRunner } from 'typeorm';

export class channelsAnnouncementPostedAt1571968395717
  implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "announcement_posted_at" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE channels DROP COLUMN IF EXISTS announcement_posted_at`,
    );
  }
}
