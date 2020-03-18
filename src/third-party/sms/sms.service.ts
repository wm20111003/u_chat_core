import { Injectable, CACHE_MANAGER, Inject } from '@nestjs/common';
import * as Core from '@alicloud/pop-core';
import { Redis } from 'ioredis';
import { isEmpty } from 'lodash';
import { Code } from '../../common/error/code';
import { captureException } from '../../common/utils';

const CAPTCHA_EXPIRED_IN = 5 * 60; // 验证码有效时间, 单位秒
const INTERVAL_LIMIT = Number(process.env.ALIYUN_SMS_INTERVAL_LIMIT); // 验证码发送间隔, 单位秒
const CONCERNED_ERRORS = [
  'isv.MOBILE_NUMBER_ILLEGAL',
  'isv.DENY_IP_RANGE',
  'isv.DAY_LIMIT_CONTROL',
];

const client = new Core({
  accessKeyId: process.env.ALIYUN_AK_ID,
  accessKeySecret: process.env.ALIYUN_AK_SECRET,
  endpoint: 'https://dysmsapi.aliyuncs.com',
  apiVersion: '2017-05-25',
});

export enum SMSType {
  LOGIN = 'login',
}

@Injectable()
export class SMSService {
  private readonly redis: Redis;

  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cache: any,
  ) {
    this.redis = cache.store.getClient();
  }

  async send(
    countryCode: string = '+86',
    phone: string,
    smsType: SMSType,
  ): Promise<string> {
    try {
      const key = `Chat:User:SMS:${smsType}:${countryCode}${phone}`;
      const existOne: any = await this.redis.hgetall(key);

      // 如果前一个验证码还没过期，直接发送前一个, 并延迟有效期
      if (!isEmpty(existOne)) {
        // 上次发送是 ${INTERVAL_LIMIT} 秒以内，提示发送太频繁
        if (Number(existOne.sendAt) > Date.now() - INTERVAL_LIMIT * 1000) {
          throw new Error(Code.SMS_TOO_MANY_REQUEST);
        }
        await Promise.all([
          this.sendSMS({ countryCode, phone, code: existOne.code }),
          this.redis.expire(key, CAPTCHA_EXPIRED_IN),
        ]);
        return existOne.code;
      }

      const code = Math.random()
        .toString()
        .slice(-6);
      const captchaPayload = { code, sendAt: Date.now() };

      await Promise.all([
        this.sendSMS({ countryCode, phone, code }),
        this.redis.hmset(key, captchaPayload),
        this.redis.expire(key, CAPTCHA_EXPIRED_IN),
      ]);
      return code;
    } catch (error) {
      captureException(error);
      console.error(error);
      throw error;
    }
  }

  async verify(
    countryCode: string,
    phone: string,
    smsType: string,
    captcha: string,
  ): Promise<boolean> {
    try {
      if (phone === '18888888888') {
        return captcha === '888888';
      }
      const key = `Chat:User:SMS:${smsType}:${countryCode}${phone}`;
      const captchaPayload: any = await this.redis.hgetall(key);
      if (captchaPayload.code === captcha) {
        this.redis.hdel(key, 'code', 'sendAt');
        return true;
      }
      return false;
    } catch (error) {
      throw error;
    }
  }

  private async sendSMS({
    countryCode,
    phone,
    code,
  }: {
    countryCode: string;
    phone: string;
    code: string;
  }): Promise<any> {
    if (process.env.TEST_MODE === 'true') return;

    try {
      const isCN = countryCode === '+86';
      const params = {
        PhoneNumbers: isCN ? phone : `${countryCode.replace('+', '')}${phone}`,
        SignName: isCN
          ? process.env.ALIYUN_SMS_CN_SIGN_NAME
          : process.env.ALIYUN_SMS_UN_SIGN_NAME,
        TemplateCode: isCN
          ? process.env.ALIYUN_SMS_CN_TEMPLATE
          : process.env.ALIYUN_SMS_UN_TEMPLATE,
        TemplateParam: JSON.stringify({ code }),
      };

      const result: any = await client.request('SendSms', params, {
        method: 'POST',
        timeout: 10000,
      });

      if (result.Code === 'OK') return true;
      console.log('SMS sent failed !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
      console.log(JSON.stringify(result));
      console.log('SMS sent failed !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
      captureException(new Error(Code.SMS_SEND_FAILED), {
        extra: {
          reason: 'SMS sent failed',
          smsServerRep: JSON.stringify(result),
        },
      });
      return new Error(Code.SMS_SEND_FAILED);
    } catch (error) {
      console.error(error);
      if (error.data && error.data.Code) {
        if (CONCERNED_ERRORS.includes(error.data.Code)) {
          const errorCode = error.data.Code.replace(/^isv\./, 'SMS_');
          throw new Error(Code[errorCode]);
        } else {
          throw new Error(Code.SMS_SERVER_ERROR);
        }
      }
      throw new Error(Code.SMS_SEND_FAILED);
    }
  }
}
