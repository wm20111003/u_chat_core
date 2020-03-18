import { Injectable, Inject, forwardRef } from '@nestjs/common';
import {
  Repository,
  SelectQueryBuilder,
  FindConditions,
  Not,
  In,
  MoreThan,
  MoreThanOrEqual,
} from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { pick, pickBy, isNull, get } from 'lodash';
import nanoid = require('nanoid');
import {
  Message,
  MessageType,
  PreAuditStatus,
  MessageStatus,
} from './message.entity';
import { Channel, ChannelType, ChannelStatus } from '../channel/channel.entity';
import { ChannelsUser } from '../channel/channels_user.entity';
import {
  ContentScanService,
  ScanResult,
  Scene,
} from '../third-party/content-scan/content-scan.service';
import { EmitService } from '../common/emitter/emit.service';
import { ChannelService } from '../channel/channel.service';
import { Code } from '../common/error/code';
import { captureException, i18n } from '../common/utils';
import { User } from '../user/user.entity';
import { ClientService } from '../client/client.service';
import { SystemMessageService } from '../system_message/system_message.service';
import { SystemMessageType } from '../system_message/system_message.entity';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_NUM = 1;
const DEFAULT_PAGE_SIZE = 20;

const WITHDRAW_EXPIRED_MIN = 2; // 2分钟
export const AUDIO_EXTENSION_PATTERN = /\.(mp3|m4a|aac|mp4)$/; // 语音文件扩展名正则

// todo: move sensitive labels to preference table
// normal: 正常文本
// spam: 含垃圾信息
// ad: 广告
// politics: 涉政
// terrorism: 暴恐
// abuse: 辱骂
// porn: 色情
// flood: 灌水
// contraband: 违禁
// meaningless: 无意义
// customized: 自定义（例如命中自定义关键词）
const SENSITIVE_LABELS = ['politics', 'terrorism', 'porn', 'contraband'];

export enum WithdrawReason {
  SCANNER_MARK_AS_PORN = 'scanner_mark_as_porn', // 审查系统标记为涉黄消息
  SCANNER_MARK_AS_TERRORISM = 'scanner_mark_as_terrorism', // 审查系统标记为涉政消息
  SCANNER_MARK_AS_ANTISPAM = 'scanner_mark_as_antispam', // 审查系统标记为垃圾消息
  AUDITOR_MARK_AS_PROHIBITED = 'auditor_mark_as_prohibited', // 审查人员标记为违禁消息
  ADMIN_WITHDRAW = 'admin_withdraw', // 管理员撤回
  GROUP_OWNER_WITHDRAW = 'group_owner_withdraw', // 群主撤回
  SENDER_WITHDRAW = 'sender_withdraw', // 发送者自己撤回
}

export enum AuditOperator {
  SCANNER = 'scanner',
  AUDITOR = 'auditor',
}

export interface MessageInput {
  channelId: number;
  userId: number;
  cid?: string;
  content?: string;
  file?: string;
  duration?: number;
}

export interface MessageAttrs extends MessageInput {
  type: MessageType;
  client_id?: number;
  nickname?: string;
  avatar?: string;
  sids?: string[];
  last_msg?: string;
  mention?: any[];
}

export interface FindParams {
  keyword?: string;
  channelName?: string;
  startAt?: string;
  endAt?: string;
  type?: MessageType;
  pageNum?: number;
  pageSize?: number;
  status?: PreAuditStatus;
}

export interface InsertMessageAttrs {
  cid: string;
  user_id: number;
  channel_id: number;
  client_id?: number;
  type: MessageType;
  content: string;
}

@Injectable()
export class MessageService {
  constructor(
    @InjectRepository(Message)
    private readonly repo: Repository<Message>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Channel)
    private readonly channelRepo: Repository<Channel>,
    @InjectRepository(ChannelsUser)
    private readonly channelsUserRepo: Repository<ChannelsUser>,
    private readonly scanService: ContentScanService,
    @Inject(forwardRef(() => ChannelService))
    private readonly channelService: ChannelService,
    private readonly emitService: EmitService,
    @Inject(forwardRef(() => ClientService))
    private readonly clientService: ClientService,
    @Inject(forwardRef(() => SystemMessageService))
    private readonly systemMessageService: SystemMessageService,
  ) {}

  async insert(params: InsertMessageAttrs): Promise<any> | never {
    const { channel_id } = params;
    const seq = await this.channelService.getNextSeqEnd(channel_id);
    const {
      identifiers: [{ id }],
    } = await this.repo
      .createQueryBuilder()
      .insert()
      .into(Message)
      .values({
        ...params,
        seq,
      })
      .setParameter('channelId', channel_id)
      .execute();
    return { id };
  }

  async save(sender: any, params: MessageAttrs): Promise<any> | never {
    try {
      const {
        cid,
        type,
        client_id,
        channelId: channel_id,
        userId: user_id,
        content,
        file,
        duration,
      } = params;

      const channel = await this.channelsUserRepo
        .createQueryBuilder('channelUser')
        .leftJoinAndSelect('channelUser.channel', 'channel')
        .select('channel.type', 'type')
        .addSelect('channel.status', 'status')
        .addSelect('channel.owner_id', 'owner_id')
        .addSelect('channel.settings', 'settings')
        .addSelect('channelUser.banned', 'memberBanned')
        .addSelect('channelUser.friend_id', 'friend_id')
        .addSelect('channelUser.memo_alias', 'memo_alias')
        .where('channelUser.channel_id = :channelId', {
          channelId: channel_id,
        })
        .andWhere('channelUser.user_id = :userId', { userId: user_id })
        .andWhere('channelUser.deleted = :deleted', { deleted: false })
        .getRawOne();

      if (!channel) {
        throw new Error(Code.COMMON_TARGET_NOT_EXIST);
      }
      if (channel.status === ChannelStatus.DELETED) {
        throw new Error(Code.CHANNEL_DELETED);
      }
      // 检查 channel 是否为blocked
      if (channel.status === ChannelStatus.BLOCKED) {
        throw new Error(Code.CHANNEL_BLOCKED);
      }
      // 检查channel是否被群主禁言，但是群主可以发消息
      if (
        channel.type === ChannelType.GROUP &&
        user_id !== channel.owner_id &&
        get(channel, 'settings.banned')
      ) {
        throw new Error(Code.CHANNEL_BANNED);
      }
      // 检查当前群成员是否被群主禁言
      if (channel.memberBanned) {
        throw new Error(Code.CHANNEL_MEMBER_BANNED);
      }

      const channelsUser = await this.channelsUserRepo.findOne(
        {
          channel_id,
          user_id,
          deleted: false,
        },
        { select: ['friend_id', 'id', 'memo_alias', 'remark_nickname'] },
      );

      let friend;
      // 当私聊时检查自己是不是对方的好友
      if (channel.friend_id) {
        friend = await this.channelsUserRepo.findOne(
          {
            channel_id,
            user_id: channel.friend_id,
            friend_id: user_id,
            deleted: false,
          },
          { select: ['blacklisted', 'memo_alias'] },
        );

        if (!friend) {
          throw new Error(Code.FRIEND_RELATIONSHIP_NOT_EXIST);
        }
        if (friend.blacklisted) {
          throw new Error(Code.FRIEND_IN_BLACKLIST);
        }
      }

      const entity = {
        cid,
        user_id,
        channel_id,
        client_id,
        type,
      } as Message;

      let mention;
      if (file) {
        if (AUDIO_EXTENSION_PATTERN.test(file)) {
          entity.type = MessageType.AUDIO;
          entity.duration = duration;
        } else {
          entity.type = MessageType.IMAGE;
        }
        entity.file = file;
      } else if (type === MessageType.CONTACT_CARD) {
        try {
          const {
            id,
            nickname: _nickname,
            avatar,
            uid,
            gender,
          } = await this.userRepo.findOne({
            select: ['nickname', 'avatar', 'uid', 'id', 'gender'],
            where: { uid: content },
          });
          entity.content = JSON.stringify({
            nickname: _nickname,
            avatar,
            gender,
            uid,
            user_id: id,
          });
        } catch (error) {
          throw new Error(Code.COMMON_TARGET_NOT_EXIST);
        }
      } else if (type === MessageType.CONTAIN_AT) {
        mention = JSON.parse(content).mention;
        entity.content = content;
      } else {
        entity.content = content;
      }

      const { id: messageId } = await this.insert(entity);
      const message = await this.repo.findOne(messageId);
      // 单聊：好友对发送者的备注，群聊：用户自己设置的备注，或者：发送者的昵称
      const nickname =
        (friend ? friend.memo_alias : channelsUser.remark_nickname) ||
        sender.nickname;
      return {
        ...pick(message, [
          'id',
          'cid',
          'user_id',
          'channel_id',
          'content',
          'file',
          'type',
          'created_at',
          'status',
          'seq',
          'duration',
        ]),
        ...pick(sender, ['uid', 'avatar']),
        nickname,
        mention,
      };
    } catch (error) {
      throw error;
    }
  }

  async specialMsgSave(params: MessageAttrs): Promise<any> | never {
    try {
      const {
        type,
        client_id,
        channelId: channel_id,
        userId: user_id,
        content,
        nickname,
        avatar,
        sids,
        last_msg,
        mention,
      } = params;

      const { id: messageId } = await this.insert({
        cid: nanoid(),
        user_id,
        channel_id,
        client_id,
        type,
        content,
      });
      const result = await this.repo.findOne(messageId);

      const message = {
        ...pick(result, [
          'cid',
          'id',
          'user_id',
          'channel_id',
          'content',
          'type',
          'status',
          'created_at',
          'seq',
        ]),
        nickname,
        avatar,
        last_msg,
        mention,
      } as any;
      if (sids) {
        await this.emitService.emitToSockets({
          event: 'message:push',
          socketIds: sids,
          data: { message },
        });
      } else {
        await this.emitService.emitToRoom({
          room: channel_id,
          event: 'message:push',
          data: { message },
        });
      }
      this.channelService.updateState({ message });
    } catch (error) {
      throw error;
    }
  }

  // 根据seq获取消息
  async getBySeq({ channelId, seqStart, seqEnd }): Promise<any> | never {
    seqEnd = Math.min(seqEnd, seqStart + 14);
    return await this.getPB()
      .where({ channel_id: channelId })
      .andWhere('message.seq between :seqStart AND :seqEnd', {
        seqStart,
        seqEnd,
      })
      // .limit(15)
      .getRawMany();
  }

  // 获取某个channel的未读消息
  async getUnread({
    friendId,
    channelId,
    userId,
    unreadMsgCount,
  }: {
    friendId: number;
    channelId: number;
    userId: number;
    unreadMsgCount?: number;
  }): Promise<any> | never {
    try {
      if (!unreadMsgCount) return [];

      // 读取截止时间
      const lastViewedAt = new Date();

      const query = this.getPB()
        .where('message.channel_id = :channelId', { channelId })
        .andWhere('message.created_at <= :createdAt', {
          createdAt: lastViewedAt,
        })
        .andWhere('message.status NOT IN (:...unNormal)', {
          unNormal: [MessageStatus.PROHIBITED, MessageStatus.DELETED],
        })
        .orderBy('message.created_at', 'DESC');

      // 加好友通过消息，双方一人只能看到其中一条
      if (friendId) {
        query.andWhere(
          '(message.type NOT IN (:...specialTypes) OR (message.type IN (:...specialTypes) AND message.user_id = :friendId))',
          {
            specialTypes: [
              MessageType.I_ACCEPT_FRIEND,
              MessageType.FRIEND_ACCEPT_ME,
            ],
            friendId,
          },
        );
      }

      const pageSize = DEFAULT_PAGE_SIZE;
      const totalPage = Math.ceil(unreadMsgCount / pageSize);
      const sids = await this.clientService.getSidByUserIds([userId]);

      for (let pageNum = 1; pageNum <= totalPage; pageNum++) {
        const offset = Math.max(unreadMsgCount - pageSize * pageNum, 0);
        const messages = (
          await query
            .offset(offset)
            .limit(unreadMsgCount < pageSize ? unreadMsgCount : pageSize)
            .getRawMany()
        )
          .reverse()
          .map(m => pickBy(m, i => !isNull(i)));
        await this.emitService.emitToSockets({
          socketIds: sids,
          event: 'message:push-unread',
          data: { messages },
        });
      }
    } catch (error) {
      throw error;
    }
  }

  async getLatestMsg(channelId: number): Promise<Message> {
    return (
      await this.repo.find({
        where: {
          channel_id: channelId,
          status: Not(In([MessageStatus.PROHIBITED, MessageStatus.DELETED])),
        },
        order: { created_at: 'DESC' },
        take: 1,
      })
    )[0];
  }

  // 获取撤回消息Ids
  async getWithdrawMsgIds(channelId: number, withdrawAt: Date) {
    return (
      await this.repo.find({
        where: {
          channel_id: channelId,
          status: MessageStatus.WITHDRAW,
          updated_at: MoreThanOrEqual(withdrawAt),
        },
        select: ['id'],
      })
    ).map(p => p.id);
  }
  /**
   * 获取可疑消息列表
   * [admin]
   * @param params
   * @param pageNum
   * @param pageSize
   */
  async getSuspectedMsgList(params: FindParams): Promise<any> | never {
    try {
      const {
        keyword,
        channelName,
        type,
        startAt,
        endAt,
        status = PreAuditStatus.SUSPECTED,
      } = params;
      let { pageNum = DEFAULT_PAGE_NUM, pageSize = DEFAULT_PAGE_SIZE } = params;
      pageNum = Math.max(pageNum, DEFAULT_PAGE_NUM);
      pageSize = Math.min(pageSize, MAX_PAGE_SIZE);
      const qb = this.getAuditMsgPB();
      qb.where('message.pre_audit_status = :pre_audit_status', {
        pre_audit_status: status,
      });
      if (keyword) {
        qb.andWhere(`(user.nickname LIKE :keyword OR user.uid LIKE :keyword)`, {
          keyword: `${keyword}%`,
        });
      }
      if (channelName) {
        qb.andWhere(`channel.name like :name`, { name: `%${channelName}%` });
      }
      if (startAt && endAt) {
        qb.andWhere(
          'message.created_at >= :startAt AND message.created_at <= :endAt',
          {
            startAt: new Date(startAt),
            endAt: new Date(endAt),
          },
        );
      }
      if (type) {
        qb.andWhere('message.type = :type', { type });
      }
      const totalCount = await qb.getCount();
      const data = await qb
        .orderBy('message.created_at', 'DESC')
        .limit(Number(pageSize))
        .offset((Number(pageNum) - 1) * Number(pageSize))
        .getRawMany();
      return { data, totalCount };
    } catch (error) {
      throw error;
    }
  }
  /**
   * 内容审核
   * [admin]
   * @param id
   * @param status
   */
  async audit(id: number, status: MessageStatus): Promise<any> | never {
    try {
      if (!id || !status) {
        throw new Error(Code.COMMON_PARAMS_MISSING);
      }
      await this.repo.update({ id }, { status });
    } catch (error) {
      throw error;
    }
  }

  private getAuditMsgPB(): SelectQueryBuilder<Message> {
    return this.repo
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.user', 'user')
      .leftJoinAndSelect('message.channel', 'channel')
      .leftJoinAndSelect('clients', 'client', 'message.client_id = client.id')
      .select('message.id', 'id')
      .addSelect('message.type', 'type')
      .addSelect('message.content', 'content')
      .addSelect('message.status', 'status')
      .addSelect('message.created_at', 'created_at')
      .addSelect('message.file', 'file')
      .addSelect('user.avatar', 'avatar')
      .addSelect('user.nickname', 'nickname')
      .addSelect('user.uid', 'uid')
      .addSelect('user.gender', 'gender')
      .addSelect('user.birthdate', 'birthdate')
      .addSelect('channel.name', 'channel_name')
      .addSelect('client.ip', 'ip')
      .addSelect('client.os', 'os')
      .addSelect('client.carrier', 'carrier');
  }

  private getPB(): SelectQueryBuilder<Message> {
    return this.repo
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.user', 'user')
      .select('message.id', 'id')
      .addSelect('message.cid', 'cid')
      .addSelect('message.user_id', 'user_id')
      .addSelect('message.channel_id', 'channel_id')
      .addSelect('message.type', 'type')
      .addSelect(
        `CASE WHEN (message.status = 'prohibited' OR message.status = 'deleted') THEN NULL ELSE content END`,
        'content',
      )
      .addSelect(
        `CASE WHEN (message.status = 'prohibited' OR message.status = 'deleted') THEN NULL ELSE file END`,
        'file',
      )
      .addSelect('message.duration', 'duration')
      .addSelect('message.seq', 'seq')
      .addSelect('message.status', 'status')
      .addSelect('message.created_at', 'created_at')
      .addSelect('user.avatar', 'avatar')
      .addSelect('user.nickname', 'nickname')
      .addSelect('user.uid', 'uid');
  }

  async scan({
    type,
    cid,
    content,
  }: {
    type: MessageType;
    cid: string;
    content: string;
  }): Promise<any> {
    if (type !== MessageType.TEXT) return;
    try {
      const {
        results: [result],
      } = await this.scanService.scan({
        cid,
        type: MessageType.TEXT,
        content,
      });
      await this.markAuditStatus({
        query: { cid },
        suggestion: result.suggestion,
        label: result.label,
        operator: AuditOperator.SCANNER,
        scene: Scene.ANISPAM,
      });
    } catch (error) {
      captureException(error);
      console.error(error);
    }
  }

  async markAuditStatus({
    message,
    query,
    label,
    suggestion,
    operator,
    scene,
  }: {
    message?: Message;
    query?: FindConditions<Message>;
    label: string;
    suggestion: string;
    operator: AuditOperator;
    scene: Scene;
  }) {
    try {
      const preAuditStatus =
        suggestion === 'block' && !SENSITIVE_LABELS.includes(label)
          ? PreAuditStatus.NORMAL
          : ScanResult[suggestion];
      message =
        message ||
        (await this.repo.findOne({
          where: query,
          order: { created_at: 'DESC' },
        }));
      if (!message) return;

      message.pre_audit_status = preAuditStatus;
      switch (preAuditStatus) {
        case PreAuditStatus.PROHIBITED:
          message.status = MessageStatus.PROHIBITED;
          break;
        case PreAuditStatus.NORMAL:
          message.status = MessageStatus.NORMAL;
          break;
        default:
          message.status = MessageStatus.PENDING;
      }
      await message.save();

      if (preAuditStatus !== PreAuditStatus.NORMAL) {
        let reason;
        if (operator === AuditOperator.SCANNER) {
          switch (scene) {
            case Scene.PORN:
              reason = WithdrawReason.SCANNER_MARK_AS_PORN;
              break;
            case Scene.ANISPAM:
              reason = WithdrawReason.SCANNER_MARK_AS_ANTISPAM;
              break;
            case Scene.TERRORISM:
              reason = WithdrawReason.SCANNER_MARK_AS_TERRORISM;
              break;
          }
        }
        if (operator === AuditOperator.AUDITOR) {
          reason = WithdrawReason.AUDITOR_MARK_AS_PROHIBITED;
        }

        // 撤回消息 更新发送者的违禁消息次数
        await Promise.all([
          this.withdraw({ message, reason }),
          this.userRepo.increment(
            { id: message.user_id },
            'prohibited_msg_count',
            1,
          ),
        ]);
      }
    } catch (error) {
      console.error(error);
      captureException(error);
    }
  }

  // 主动撤回消息
  async checkAndWithdraw({
    userId,
    messageId,
    channelId,
    client_id,
  }: {
    userId: number;
    messageId: number;
    channelId: number;
    client_id?: number;
  }) {
    const now = new Date();
    const expiredAt = new Date(
      now.setMinutes(now.getMinutes() - WITHDRAW_EXPIRED_MIN),
    );
    const filterQuery = {
      id: messageId,
      channel_id: channelId,
    } as any;

    const withdrawByGroupOwner = await this.channelService.isOwner(
      userId,
      channelId,
    );

    if (!withdrawByGroupOwner) {
      filterQuery.user_id = userId;
      filterQuery.created_at = MoreThan(expiredAt);
    }

    const message = await this.repo.findOne(filterQuery, {
      select: ['user_id'],
    });

    if (!message) {
      throw new Error(Code.COMMON_NO_PERMISSION);
    }
    const isGroupOwnerErase =
      withdrawByGroupOwner && message.user_id !== userId;
    const reason = isGroupOwnerErase
      ? WithdrawReason.GROUP_OWNER_WITHDRAW
      : WithdrawReason.SENDER_WITHDRAW;

    const [operator] = await Promise.all([
      this.channelService.getOperator(channelId, userId),
      this.repo.update({ id: messageId }, { status: MessageStatus.WITHDRAW }),
      this.withdraw({
        query: { id: messageId },
        reason,
      }),
    ]);
    if (isGroupOwnerErase) {
      const operated = await this.channelService.getOperator(
        channelId,
        message.user_id,
      );
      await this.specialMsgSave({
        type: MessageType.WITHDRAW_BY_GROUP_OWNER,
        client_id,
        channelId,
        userId,
        content: JSON.stringify({
          operator,
          operated: [operated],
        }),
        nickname: operator.nickname,
        avatar: operator.avatar,
      });
    } else {
      await this.specialMsgSave({
        type: MessageType.WITHDRAW_BY_SENDER,
        client_id,
        channelId,
        userId,
        content: JSON.stringify({
          operator,
        }),
        nickname: operator.nickname,
        avatar: operator.avatar,
      });
    }
  }

  // 撤回消息
  private async withdraw({
    message,
    query,
    reason,
  }: {
    message?: Message;
    query?: FindConditions<Message>;
    reason: WithdrawReason;
  }): Promise<any> | never {
    message =
      message ||
      (await this.repo.findOne(query, {
        select: ['id', 'cid', 'channel_id', 'user_id'],
      }));
    const { channel_id, id, cid, user_id } = message;

    await Promise.all([
      // 客户端撤回消息
      this.emitService.emitToRoom({
        room: channel_id,
        event: 'message:push-withdraw',
        data: { id, cid, channel_id, reason },
      }),
      // 更新channel状态
      this.channelService.updateState({
        channelId: channel_id,
        withdraw: true,
      }),
    ]);
    // 群主主动撤回或内容审核后撤回发送系统消息
    if (reason !== WithdrawReason.SENDER_WITHDRAW) {
      const type =
        reason === WithdrawReason.GROUP_OWNER_WITHDRAW
          ? SystemMessageType.SYSTEM_NOTICE
          : SystemMessageType.MESSAGE_BLOCKED;
      const { locale } = await this.userRepo.findOne(user_id, {
        select: ['locale'],
      });
      await this.systemMessageService.create({
        userId: user_id,
        content: this.humanizeReason(reason, locale),
        type,
      });
    }
  }

  private humanizeReason(reason: string, locale = 'zh-CN') {
    if (!(Object.values(WithdrawReason) as [string]).includes(reason)) {
      reason = 'message_withdraw';
    }

    return i18n.__(
      {
        phrase: `${reason}`,
        locale,
      },
      { date: new Date().toISOString().replace('T', ' ') },
    );
  }
}
