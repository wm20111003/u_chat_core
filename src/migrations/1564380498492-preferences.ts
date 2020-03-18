import { MigrationInterface, QueryRunner } from 'typeorm';

export class Preferences1564380498492 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    const ossConfig = JSON.stringify({
      region: 'oss-ap-southeast-3',
      bucket: 'cyanchat-develop',
      endpoint: 'oss-accelerate.aliyuncs.com',
    });
    await queryRunner.query(`INSERT INTO public.preferences(
        name, value, type)
        VALUES ('oss_config', '${ossConfig}'
        , 'string'),
         ('cdn_host', 'https://cyanchat-develop.oss-accelerate.aliyuncs.com', 'string'),
         ('newbie_greeting', '欢迎来到青派', 'string'),
         ('service_term', '<h1>青派软件许可及服务协议</h1><h3>首部及导言</h3>', 'code'),
         ('notice_of_complaint', '<p>你应该保证你的投诉行为基于善意，并代表你本人的真实意思。青派会作为中立平台服务者，收到你的投诉后，会尽快按照相关法律规定独立判断并进行处理。</p><p>青派将会采取合理的措施保护你的个人信息；除法律规定的情形外，未经用户许可青派不会向第三方公开、透露你的个人信息。</p>', 'code')`);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `DELETE FROM public.preferences WHERE name IN ('oss_config', 'cdn_host', 'newbie_greeting', 'service_term', 'notice_of_complaint')`,
    );
  }
}
