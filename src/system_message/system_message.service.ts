import { Repository } from 'typeorm';
import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { SYSTEM_CHANNEL } from './system_message.constant';
import { SystemMessage, SystemMessageType } from './system_message.entity';
import { User } from '../user/user.entity';
import { ClientService } from '../client/client.service';
import { EmitService } from '../common/emitter/emit.service';
import { Code } from '../common/error/code';
import nanoid = require('nanoid');

interface CreateParams {
  userId: number;
  content: string;
  type: SystemMessageType;
}

@Injectable()
export class SystemMessageService {
  constructor(
    @InjectRepository(SystemMessage)
    private readonly systemMsgRepo: Repository<SystemMessage>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @Inject(forwardRef(() => ClientService))
    private readonly clientService: ClientService,
    private readonly emitService: EmitService,
  ) {}

  async create(params: CreateParams): Promise<any> | never {
    try {
      const { userId: user_id, content, type } = params;
      const user = await this.userRepo.findOne(user_id);
      if (!user) {
        throw new Error(Code.COMMON_TARGET_NOT_EXIST);
      }
      const {
        identifiers: [{ id: messageId }],
      } = await this.systemMsgRepo
        .createQueryBuilder()
        .insert()
        .into(SystemMessage)
        .values({
          user_id,
          content,
          type,
          cid: nanoid(),
          seq: () =>
            '(select count(1) from system_messages where user_id = :userId) + 1',
        })
        .setParameter('userId', user_id)
        .execute();

      const [socketIds, message] = await Promise.all([
        this.clientService.getSidByUserIds([user_id]),
        this.systemMsgRepo.findOne(messageId),
      ]);

      await this.emitService.emitToSockets({
        event: 'message:push',
        socketIds,
        data: {
          message: {
            id: message.id,
            cid: message.cid,
            type: 'text',
            created_at: message.created_at,
            content: message.content,
            channel_id: SYSTEM_CHANNEL.id,
            name: SYSTEM_CHANNEL.name,
            avatar: SYSTEM_CHANNEL.avatar,
            status: 'normal',
            seq: message.seq,
          },
        },
      });
      return message;
    } catch (error) {
      throw error;
    }
  }

  async getMsgBySeq({
    userId,
    seqStart,
    seqEnd,
  }: {
    userId: number;
    seqStart: number;
    seqEnd: number;
  }): Promise<any> | never {
    const qb = this.systemMsgRepo
      .createQueryBuilder('message')
      .select(['id', 'content', 'created_at', 'cid', 'seq'])
      .addSelect("'normal'", 'status')
      .where('message.user_id = :userId', { userId })
      .andWhere('seq between :seqStart AND :seqEnd', { seqStart, seqEnd })
      .limit(15);
    try {
      return (await qb.getRawMany()).map(row => ({
        ...row,
        name: SYSTEM_CHANNEL.name,
        channel_id: SYSTEM_CHANNEL.id,
        avatar: SYSTEM_CHANNEL.avatar,
        type: 'text',
      }));
    } catch (error) {
      throw error;
    }
  }

  async markAsRead(userId: number): Promise<any> | never {
    try {
      return await this.systemMsgRepo.update(
        { read: false, user_id: userId },
        { read: true },
      );
    } catch (error) {
      throw error;
    }
  }
}
