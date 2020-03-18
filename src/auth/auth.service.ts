import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, CACHE_MANAGER, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { SMSService, SMSType } from '../third-party/sms/sms.service';
import { User, UserState } from '../user/user.entity';
import { Code } from '../common/error/code';
import { uid } from '../common/utils';
import { ClientPlatform } from '../client/client.entity';

@Injectable()
export class AuthService {
  private readonly redis: Redis;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly smsService: SMSService,
    @Inject(CACHE_MANAGER)
    private readonly cache: any,
  ) {
    this.redis = cache.store.getClient();
  }

  async login(params: {
    countryCode: string;
    phone: string;
    captcha: string;
    platform: string;
  }): Promise<any> {
    try {
      const { countryCode, phone, captcha, platform } = params;
      // login logic
      const isValidCode = await this.smsService.verify(
        countryCode,
        phone,
        SMSType.LOGIN,
        captcha,
      );
      if (!isValidCode) {
        throw new Error(Code.AUTH_CAPTCHA_INVALID);
      }
      const preUser = await this.userRepo.findOne({ phone });
      if (preUser && preUser.state !== UserState.NORMAL) {
        throw new Error(
          preUser.state === UserState.BLOCKED
            ? Code.AUTH_ACCOUNT_BLOCKED
            : Code.AUTH_ACCOUNT_DELETED,
        );
      }
      const user =
        preUser ||
        this.userRepo.create({
          uid: uid(),
          phone_country_code: countryCode,
          phone,
        });
      user.last_login_at = new Date();

      await user.save();
      // default algorithm HS256
      const token = await this.jwtService.signAsync({ id: user.id });
      await this.redis.set(`Chat:User:Token:${user.id}:${platform}`, token);

      return { user, token };
    } catch (error) {
      throw error;
    }
  }

  async resume(token: string, platform: string): Promise<any> {
    try {
      const payload = await this.jwtService.verifyAsync(token);
      if (!payload.id) {
        throw new Error(Code.AUTH_TOKEN_INVALID);
      }
      if (platform === ClientPlatform.APP) {
        const loginToken = await this.redis.get(
          `Chat:User:Token:${payload.id}:${platform}`,
        );
        if (token !== loginToken) {
          throw new Error(Code.AUTH_TOKEN_INVALID);
        }
      }
      const user = await this.userRepo.findOne(payload.id);
      user.last_login_at = new Date();
      return await user.save();
    } catch (error) {
      throw error;
    }
  }
}
