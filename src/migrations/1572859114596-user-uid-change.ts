import { MigrationInterface, QueryRunner } from 'typeorm';

export class userUidChange1572859114596 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "uid_changed" boolean DEFAULT 'false' `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`ALTER TABLE users DROP COLUMN uid_changed`);
  }
}
