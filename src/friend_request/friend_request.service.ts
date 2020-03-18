import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  SelectQueryBuilder,
  TransactionRepository,
  MoreThan,
} from 'typeorm';
import { pick } from 'lodash';
import { FriendRequest, FriendRequestStatus } from './friend_request.entity';
import { ChannelService } from '../channel/channel.service';
import { ClientService } from '../client/client.service';
import { User } from '../user/user.entity';
import { EmitService } from '../common/emitter/emit.service';
import { Code } from '../common/error/code';
import { MessageService } from '../message/message.service';
import { MessageType } from '../message/message.entity';
import { ChannelsUser } from '../channel/channels_user.entity';
import { i18n } from '../common/utils';

// 请求过期天数
const REQUEST_EXPIRED_IN = 3;
export interface RequestInput {
  toId: number;
  fromId: number;
  message: string;
  memo_alias: string;
}
@Injectable()
export class FriendRequestService {
  constructor(
    @InjectRepository(FriendRequest)
    @TransactionRepository(FriendRequest)
    private readonly repo: Repository<FriendRequest>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(ChannelsUser)
    private readonly channelsUser: Repository<ChannelsUser>,
    private readonly channelService: ChannelService,
    private readonly clientService: ClientService,
    private readonly emitService: EmitService,
    private readonly messageService: MessageService,
  ) {}

  // CHAT-84 创建请求
  async createRequest(attrs: RequestInput): Promise<any> {
    try {
      const { toId, fromId, message, memo_alias } = attrs;

      if (await this.channelService.isFriend(fromId, toId)) {
        throw new Error(Code.FRIEND_RELATIONSHIP_EXIST);
      }

      // 修改或创建好友请求
      const preEntity = await this.repo.findOne({
        to_id: toId,
        from_id: fromId,
        expire_at: MoreThan(new Date()),
        status: FriendRequestStatus.PENDING,
      });
      const now = new Date();
      const request =
        preEntity ||
        this.repo.create({
          to_id: toId,
          from_id: fromId,
        });
      Object.assign(request, {
        memo_alias,
        message,
        expire_at:
          process.env.TEST_MODE === 'true'
            ? new Date(now.setHours(now.getHours() + 1))
            : new Date(now.setDate(now.getDate() + REQUEST_EXPIRED_IN)),
      });

      // 判断对方设置
      const [toSids, toUser, fromUser] = await Promise.all([
        this.clientService.getSidByUserIds([toId]),
        this.userRepo.findOne(toId, {
          select: ['nickname', 'avatar', 'contact_verify_required', 'locale'],
        }),
        this.userRepo.findOne(fromId, {
          select: ['id', 'uid', 'gender', 'nickname', 'avatar'],
        }),
      ]);
      // 需要发送验证, 发送验证并返回
      if (toUser.contact_verify_required) {
        const entity = await this.repo.save(request);
        const { id: user_id, nickname, avatar, gender, uid } = fromUser;
        const { id, status, expire_at } = entity;
        const requestData = {
          id,
          message,
          status,
          avatar,
          nickname,
          user_id,
          uid,
          gender,
          expire_at,
        };
        if (toSids.length > 0) {
          await this.emitService.emitToSockets({
            event: 'friend:request:push-addNew',
            socketIds: toSids,
            data: { friendRequest: requestData },
          });
        }
        return entity;
      }

      // 无好友验证 修改状态为成功 推送已添加好友
      request.status = FriendRequestStatus.ACCEPT;

      const [friendRequest, channel] = await Promise.all([
        this.repo.save(request),
        this.channelService.createDirect(request),
      ]);

      const channelInfo = pick(channel, [
        'id',
        'name',
        'announcement',
        'avatar',
        'type',
        'owner_id',
        'last_msg',
        'last_msg_at',
        'updated_at',
        'seq_end',
        'settings',
      ]);

      const [fromChannelUser, toChannelUser] = channel.channelsUsers;
      const [fromChannel, toChannel, fromSids] = await Promise.all([
        this.findOneDirect(channelInfo, fromChannelUser),
        this.findOneDirect(channelInfo, toChannelUser),
        this.clientService.getSidByUserIds([fromId]),
      ]);

      // 推送事件
      await Promise.all([
        this.emitService.joinRoom({
          room: channel.id,
          socketIds: [...toSids, ...fromSids],
        }),
        this.emitService.emitToSockets({
          event: 'channel:push-addNew',
          socketIds: toSids,
          data: { channel: toChannel },
        }),
        this.emitService.emitToSockets({
          event: 'channel:push-addNew',
          socketIds: fromSids,
          data: { channel: fromChannel },
        }),
      ]);
      // 无需好友验证  消息推送
      await Promise.all([
        this.messageService.specialMsgSave({
          type: MessageType.I_ACCEPT_FRIEND,
          channelId: Number(channel.id),
          userId: fromId,
          content: i18n.__(
            {
              phrase: 'i_accept_friend',
              locale: toUser.locale,
            },
            { friend: fromUser.nickname },
          ),
          sids: toSids,
        }),
        this.messageService.specialMsgSave({
          type: MessageType.FRIEND_ACCEPT_ME,
          channelId: Number(channel.id),
          userId: toId,
          content: i18n.__('friend_accept_me'),
          sids: fromSids,
          nickname: toUser.nickname,
          avatar: toUser.avatar,
        }),
      ]);

      return friendRequest;
    } catch (error) {
      throw error;
    }
  }

  // CHAT-84 同意/拒绝/删除
  async reply(params: any): Promise<object> | never {
    try {
      const {
        id,
        status,
        client_id,
        nickname: operatorNickname,
        avatar: operatorAvatar,
        operatorId,
      } = params;

      if (status === FriendRequestStatus.ACCEPT) {
        const friendRequest = await this.repo.findOne({
          id,
          status: FriendRequestStatus.PENDING,
        });

        if (!friendRequest) {
          throw new Error(Code.FRIEND_REQUEST_NOT_PENDING);
        }

        if (new Date() > friendRequest.expire_at) {
          throw new Error(Code.FRIEND_REQUEST_EXPIRED);
        }

        friendRequest.status = status;
        await friendRequest.save();

        if (status !== FriendRequestStatus.ACCEPT) {
          return;
        }

        const channel = await this.channelService.createDirect(friendRequest);

        const channelInfo = pick(channel, [
          'id',
          'name',
          'announcement',
          'avatar',
          'type',
          'owner_id',
          'last_msg',
          'last_msg_at',
          'updated_at',
          'seq_end',
        ]);

        const [fromChannelUser, toChannelUser] = channel.channelsUsers;
        const [
          [{ nickname }],
          fromChannel,
          toChannel,
          fromSids,
          toSids,
          { locale },
        ] = await Promise.all([
          this.channelService.getNicknameByUserIds([friendRequest.from_id]),
          this.findOneDirect(channelInfo, fromChannelUser),
          this.findOneDirect(channelInfo, toChannelUser),
          this.clientService.getSidByUserIds([friendRequest.from_id]),
          this.clientService.getSidByUserIds([friendRequest.to_id]),
          this.userRepo.findOne(friendRequest.to_id, {
            select: ['locale'],
          }),
        ]);
        // locale = undefined;
        await Promise.all([
          this.emitService.joinRoom({
            room: channel.id,
            socketIds: [...toSids, ...fromSids],
          }),
          this.emitService.emitToSockets({
            event: 'channel:push-addNew',
            socketIds: toSids,
            data: { channel: toChannel },
          }),
          this.emitService.emitToSockets({
            event: 'channel:push-addNew',
            socketIds: fromSids,
            data: { channel: fromChannel },
          }),
        ]);

        await Promise.all([
          this.messageService.specialMsgSave({
            type: MessageType.I_ACCEPT_FRIEND,
            client_id,
            channelId: Number(channel.id),
            userId: friendRequest.from_id,
            content: i18n.__(
              {
                phrase: 'i_accept_friend',
                locale,
              },
              { friend: nickname },
            ),
            last_msg: i18n.__('friend_accept_me'),
            sids: toSids,
          }),
          this.messageService.specialMsgSave({
            type: MessageType.FRIEND_ACCEPT_ME,
            client_id,
            channelId: Number(channel.id),
            userId: friendRequest.to_id,
            content: i18n.__('friend_accept_me'),
            sids: fromSids,
            nickname: operatorNickname,
            avatar: operatorAvatar,
            last_msg: i18n.__(
              {
                phrase: 'i_accept_friend',
                locale,
              },
              { friend: nickname },
            ),
          }),
        ]);
        // 兼容PC端之前的功能，需求中无拒绝功能
      } else if (status === FriendRequestStatus.REJECT) {
        await this.repo.update(id, { status });
      } else if (status === FriendRequestStatus.DELETED) {
        await this.repo.update(id, { status, deleted_at: new Date() });
      } else {
        throw new Error(Code.FRIEND_REQUEST_STATUS_NOT_MATCH);
      }
    } catch (error) {
      throw error;
    }
  }

  async setStatus(id: number, status: FriendRequestStatus): Promise<any> {
    try {
      await this.repo.update(
        { id, status: FriendRequestStatus.PENDING },
        { status },
      );
      return await this.repo.findOne(id);
    } catch (error) {
      throw error;
    }
  }

  // CHAT-84  删除请求
  async removeRequest(id: number): Promise<any> {
    try {
      return await this.repo.update(
        { id },
        { status: FriendRequestStatus.DELETED, deleted_at: Date.now() },
      );
    } catch (error) {
      throw error;
    }
  }

  // 获取好友邀请列表
  async getRequests(toId: number): Promise<any[]> | never {
    try {
      return await this.getPB()
        .where(
          'friend_request.to_id = :toId AND friend_request.status = :pending',
          {
            toId,
            pending: FriendRequestStatus.PENDING,
          },
        )
        .orderBy('friend_request.created_at', 'DESC')
        .getRawMany();
    } catch (error) {
      throw error;
    }
  }

  // 根据 id 查询一个好友请求信息
  async getRequest(id: number): Promise<any> | never {
    try {
      const pb = this.getPB();
      return await pb
        .where('friend_request.id = :id ', {
          id,
        })
        .getRawOne();
    } catch (error) {
      throw error;
    }
  }

  private getPB(): SelectQueryBuilder<FriendRequest> {
    return this.repo
      .createQueryBuilder('friend_request')
      .leftJoinAndSelect('friend_request.fromUser', 'user')
      .select('friend_request.id', 'id')
      .addSelect('friend_request.message', 'message')
      .addSelect('friend_request.status', 'status')
      .addSelect('friend_request.expire_at', 'expire_at')
      .addSelect('user.avatar', 'avatar')
      .addSelect('user.nickname', 'nickname')
      .addSelect('user.id', 'user_id')
      .addSelect('user.uid', 'uid')
      .addSelect('user.gender', 'gender');
  }

  private async findOneDirect(
    channel: any,
    channelUser: any,
  ): Promise<any> | never {
    const user = await this.userRepo.findOne(channelUser.friend_id, {
      select: [
        'id',
        'uid',
        'nickname',
        'phone',
        'avatar',
        'gender',
        'nickname_pinyin',
      ],
    });
    if (!user) {
      return null;
    }
    const restChannelUserInfo = pick(channelUser, [
      'msg_count',
      'unread_msg_count',
      'muted',
      'memo_alias',
      'memo_phone',
      'blacklisted',
      'seq_start',
    ]);
    // 后续有2次异步消息发送，此处提前加2
    const seqEnd = channel.seq_end + 2;
    const name = channel.name || channelUser.memo_alias || user.nickname || '';
    const avatar = channel.avatar || user.avatar || '';
    const pinyin = channelUser.memo_alias_pinyin || user.nickname_pinyin || '';
    const { id: userId, nickname_pinyin, ...restUserInfo } = user;
    return {
      ...channel,
      ...restChannelUserInfo,
      ...restUserInfo,
      user_id: userId,
      name,
      avatar,
      pinyin,
      seq_end: seqEnd,
    };
  }
}
