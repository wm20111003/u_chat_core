import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChannelCodeAdd1576141385178 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "code" character varying`,
    );
    await queryRunner.query(
      `CREATE OR REPLACE FUNCTION nanoid(
          IN string_length INTEGER,
          IN possible_chars TEXT DEFAULT '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
      ) RETURNS text
      LANGUAGE plpgsql
      AS $$
      DECLARE
        output TEXT = '';
        i INT4;
        pos INT4;
      BEGIN
        FOR i IN 1..string_length LOOP
              pos := 1 + CAST( random() * ( LENGTH(possible_chars) - 1) AS INT4 );
              output := output || substr(possible_chars, pos, 1);
      END LOOP;
      RETURN output;
      END;
      $$;`,
    );
    await queryRunner.query(
      ` UPDATE channels SET code=nanoid(20) WHERE code is null`,
    );
    await queryRunner.query(
      `INSERT INTO  public.preferences(name, value, type)
        VALUES  ('web_portal', 'https://portal.cyanchat.cn', 'string') ON CONFLICT DO NOTHING`,
    );
  }
  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`ALTER TABLE channels DROP COLUMN code`);
    await queryRunner.query(
      `DELETE FROM public.preferences WHERE name = 'web_portal'`,
    );
  }
}
