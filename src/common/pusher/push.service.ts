import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { JPushAsync as JPush } from 'jpush-async';
import { truncate, toString } from 'lodash';
import { ChannelService } from '../../channel/channel.service';
import { ChannelType } from '../../channel/channel.entity';
import { User } from '../../user/user.entity';
import { i18n } from '../utils';
import { AUDIO_EXTENSION_PATTERN } from '../../message/message.service';
import { MessageType } from '../../message/message.entity';

// 具体参数
// https://docs.jiguang.cn/jpush/server/push/rest_api_v3_push/#audience

interface InputMessage {
  cid: string;
  channelId: number;
  userId: number;
  content?: string;
  file?: string;
  extras?: any;
  nickname: string;
  type?: string;
}

const RETRY_TIMES = 5;

const client = JPush.buildClient({
  appKey: process.env.JPUSH_APP_KEY,
  masterSecret: process.env.JPUSH_MASTER_SECRET,
  retryTimes: RETRY_TIMES,
  isDebug: true,
});

@Injectable()
export class PushService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly channelService: ChannelService,
  ) {}

  async sendSystemMsg({
    alias,
    content,
  }: {
    alias: string[];
    content: string;
  }): Promise<any> | never {
    try {
      await this.send({
        alias,
        content,
        title: '青派助手',
      });
    } catch (error) {
      throw error;
    }
  }

  async sendMsg({ message }: { message: InputMessage }): Promise<any> | never {
    try {
      const {
        cid,
        channelId,
        userId,
        content,
        file,
        extras = {},
        nickname,
        type,
      } = message;
      const [
        { title, alias = [], channelType },
        { locale },
      ] = await Promise.all([
        this.channelService.getPushInfo(userId, channelId),
        this.userRepo.findOne(userId, {
          select: ['locale'],
        }),
      ]);

      if (alias.length === 0) {
        return;
      }

      let msg = content;

      if (file) {
        const phrase = AUDIO_EXTENSION_PATTERN.test(file) ? 'audio' : 'image';
        msg = `[${i18n.__({ phrase, locale })}]`;
        if (channelType === ChannelType.GROUP) {
          msg = `${nickname}: ${msg}`;
        }
      }
      if (type === MessageType.CONTACT_CARD) {
        msg = `[${i18n.__({ phrase: 'contact_card', locale })}]`;
      } else if (type === MessageType.CONTAIN_AT) {
        msg = JSON.parse(content).text;
      }
      await this.send({
        alias,
        content: truncate(msg),
        title,
        extras: { cid, ...extras },
      });
    } catch (error) {
      console.log(error);
      // throw error;
    }
  }

  private async send({
    alias,
    content,
    title,
    extras,
  }: {
    alias: string[];
    content: string;
    title: string;
    extras?: {};
  }): Promise<any> | never {
    const apns_production =
      toString(process.env.JPUSH_PRODUCTION).toLocaleLowerCase() === 'true';
    return await client
      .push()
      .setPlatform('ios', 'android')
      .setAudience(JPush.alias(alias || []))
      .setNotification(
        JPush.android(content, title, null, { ...extras }),
        JPush.ios({ title, body: content }, null, '+1', null, {
          ...extras,
        }),
      )
      .setOptions(null, 60, null, apns_production)
      .send();
  }
}
