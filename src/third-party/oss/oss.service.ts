import { Injectable, CACHE_MANAGER, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { STS } from 'ali-oss';
import { template, isEmpty } from 'lodash';
import { captureException } from '../../common/utils';

export enum ObjectScope {
  MESSAGE = 'message',
  AVATAR_USER = 'avatar/user',
  AVATAR_CHANNEl = 'avatar/channel',
  COMPLAINT = 'complaint',
  FEEDBACK = 'feedback',
}

export interface SignatureResult {
  AccessKeyId: string;
  AccessKeySecret: string;
  SecurityToken: string;
  Expiration: string;
}

const {
  ALIYUN_AK_ID: accessKeyId,
  ALIYUN_AK_SECRET: accessKeySecret,
  ALIYUN_OSS_BUCKET: bucket,
  ALIYUN_OSS_ROLE_ARN: roleArn,
  ALIYUN_OSS_TOKEN_EXPIRE_IN: tokenExpireIn,
} = process.env;

const getPolicy = template(`
{
  "Statement": [
    {
      "Action": [
        "oss:GetObject",
        "oss:PutObject",
        "oss:AbortMultipartUpload"
      ],
      "Effect": "Allow",
      "Resource": ["acs:oss:*:*:${bucket}/<%= scope %>/*"]
    }
  ],
  "Version": "1"
}
`);

const ossClient = new STS({
  accessKeyId,
  accessKeySecret,
});

@Injectable()
export class OSSService {
  private readonly redis: Redis;
  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cache: any,
  ) {
    this.redis = cache.store.getClient();
  }

  // 客户端直传时，服务端签名验证
  async signature(scope: ObjectScope): Promise<SignatureResult> {
    const policy = getPolicy({ scope }).trim();

    try {
      const key = `Chat:OSS:Sign:${scope}`;
      const cachedSign: any = await this.redis.hgetall(key);
      if (!isEmpty(cachedSign)) {
        return cachedSign;
      }
      const {
        credentials: {
          AccessKeyId,
          AccessKeySecret,
          SecurityToken,
          Expiration,
        },
      } = await ossClient.assumeRole(roleArn, policy, String(tokenExpireIn));
      const sign = { AccessKeyId, AccessKeySecret, SecurityToken, Expiration };
      await this.redis.hmset(key, sign);
      await this.redis.expire(key, Number(tokenExpireIn) - 10);

      return sign;
    } catch (error) {
      captureException(error, { extra: { scope, policy } });
      throw error;
    }
  }
}
