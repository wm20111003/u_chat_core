import { MigrationInterface, QueryRunner } from 'typeorm';

export class preferenceDatePrecision1578542821874
  implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`
      ALTER TABLE "preferences" ALTER COLUMN "created_at" TYPE TIMESTAMP(3);
      ALTER TABLE "preferences" ALTER COLUMN "updated_at" TYPE TIMESTAMP(3);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`
      ALTER TABLE "preferences" ALTER COLUMN "created_at" TYPE TIMESTAMP(6);
      ALTER TABLE "preferences" ALTER COLUMN "updated_at" TYPE TIMESTAMP(6);
    `);
  }
}
