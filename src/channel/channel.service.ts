import { Injectable, forwardRef, Inject } from '@nestjs/common';
import { Repository, SelectQueryBuilder, In, MoreThan, Not } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Channel, ChannelType, ChannelStatus } from './channel.entity';
import { ChannelsUser, ChannelUserRole } from './channels_user.entity';
import { User, UserState } from '../user/user.entity';
import { MessageType } from '../message/message.entity';
import {
  MessageService,
  AUDIO_EXTENSION_PATTERN,
} from '../message/message.service';
import { pick, truncate, isEmpty, find, uniq, isNull, pickBy } from 'lodash';
import { EmitService } from '../common/emitter/emit.service';
import { ClientService } from '../client/client.service';
import { UserService } from '../user/user.service';
import { SystemMessage } from '../system_message/system_message.entity';
import { Code } from '../common/error/code';
import {
  getStringLengthForChinese,
  captureException,
  i18n,
  getPinyin,
  uid,
} from '../common/utils';
import { SYSTEM_CHANNEL } from '../system_message/system_message.constant';

const OPERATOR_ADMIN = { nickname: 'admin', uid: 'admin', avatar: null };
const GROUP_FIELDS = [
  'id',
  'code',
  'avatar',
  'type',
  'name',
  'owner_id',
  'last_msg',
  'last_msg_at',
  'announcement',
  'announcement_posted_at',
  'total_msg_count',
  'member_count',
  'member_count_limit',
  'complaint_times',
  'status',
  'updated_at',
  'seq_end',
  'settings',
];

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_NUM = 1;
const DEFAULT_PAGE_SIZE = 20;

interface FindFriendsParams {
  userId: number;
  keyword?: string;
  pageNum: number;
  pageSize: number;
}

export interface GroupInput {
  creatorId?: number;
  memberIds?: number[];
  ownerId?: number;
  name?: string;
  announcement?: string;
  member_count_limit?: number;
  avatar?: string;
  owner_uid?: string;
}

export interface GetMembersParams {
  channelId: number;
  keyword?: string;
  pageNum?: number;
  pageSize?: number;
}

export interface RemoveUserParams {
  channelId: number;
  userIds: number[];
  channelType: string;
  operatorId?: number;
  client_id?: number;
}

export interface AddUserParams {
  channelId?: number;
  userIds: number[];
  operatorId?: number;
  client_id?: number;
  viaQrcode: boolean;
  channel?: any;
  code?: string;
  viaLink?: boolean;
}

@Injectable()
export class ChannelService {
  constructor(
    @InjectRepository(Channel)
    private readonly repo: Repository<Channel>,
    @InjectRepository(ChannelsUser)
    private readonly joinRepo: Repository<ChannelsUser>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(SystemMessage)
    private readonly systemMsgRepo: Repository<SystemMessage>,
    private readonly messageService: MessageService,
    private readonly emitService: EmitService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    @Inject(forwardRef(() => ClientService))
    private readonly clientService: ClientService,
  ) {}

  // 创建直接聊天  patch
  async createDirect({ from_id, to_id, memo_alias }): Promise<any> | never {
    try {
      const query = this.joinRepo
        .createQueryBuilder('channelUsers')
        .select(['channelUsers.channel_id'])
        .where(
          'channelUsers.user_id = :from_id and channelUsers.friend_id = :to_id',
          {
            from_id,
            to_id,
          },
        )
        .orWhere(
          'channelUsers.user_id = :to_id and channelUsers.friend_id = :from_id',
          {
            from_id,
            to_id,
          },
        );
      const hadChannelUsers = await query.getCount();
      if (hadChannelUsers) {
        // 补齐数据
        const channelId = (await query.getOne()).channel_id;
        const channelInfo = await this.repo.findOne(channelId, {
          select: ['seq_end'],
        });
        // 初始化部分数据
        const fromUpdateField = {
          deleted: false,
          blacklisted: false,
          seq_start: channelInfo.seq_end,
        } as ChannelsUser;
        if (memo_alias) {
          fromUpdateField.memo_alias = memo_alias;
          fromUpdateField.memo_alias_pinyin = getPinyin(memo_alias);
        }
        // 好友删除方，重新添加好友后，数据初始化。
        const toUpdateField = {
          deleted: false,
          msg_count: 0,
          unread_msg_count: 0,
          memo_alias: null,
          memo_alias_pinyin: null,
          memo_phone: null,
          muted: false,
          blacklisted: false,
          seq_start: channelInfo.seq_end,
        } as ChannelsUser;

        const [channelEntity] = await Promise.all([
          // find channel info
          this.repo.findOne(channelId, {
            relations: ['channelsUsers'],
          }),
          // update form channelUser
          this.joinRepo.update(
            { channel_id: channelId, user_id: from_id, friend_id: to_id },
            fromUpdateField,
          ),
          // update to channelUser
          this.joinRepo.update(
            {
              channel_id: channelId,
              user_id: to_id,
              friend_id: from_id,
            },
            toUpdateField,
          ),
        ]);
        // 根据好友请求发起方重新生成from和to的channelUser数据
        const fromChannelUser = find(channelEntity.channelsUsers, {
          user_id: from_id,
          friend_id: to_id,
        });
        const toChannelUser = find(channelEntity.channelsUsers, {
          user_id: to_id,
          friend_id: from_id,
        });
        Object.assign(fromChannelUser, fromUpdateField);
        Object.assign(toChannelUser, toUpdateField);
        (channelEntity.channelsUsers as any) = [fromChannelUser, toChannelUser];
        return channelEntity;
      }

      const channel = this.repo.create({
        type: ChannelType.DIRECT,
        creator_id: from_id,
        owner_id: from_id,
      });
      const fromChannelsUser = this.joinRepo.create({
        user_id: from_id,
        friend_id: to_id,
        memo_alias,
      });
      const toChannelsUser = this.joinRepo.create({
        user_id: to_id,
        friend_id: from_id,
      });
      channel.channelsUsers = [fromChannelsUser, toChannelsUser];
      return await channel.save();
    } catch (error) {
      throw error;
    }
  }

  // 创建群聊
  async createGroup(
    creatorId: number,
    memberIds: number[],
  ): Promise<any> | never {
    return await this.createGroupCommon({ creatorId, memberIds });
  }

  //  移除 /添加成员(成员数量小于9) 推送给所有用户
  // 更新群成员数量和群头像
  private async updateForMembersChange(
    channelId: number,
  ): Promise<any> | never {
    const avatar = (
      await this.joinRepo
        .createQueryBuilder('channelsUser')
        .leftJoinAndSelect('channelsUser.user', 'user')
        .where({ channel_id: channelId, deleted: false })
        .andWhere('user.state = :userState', { userState: UserState.NORMAL })
        .select('user.avatar', 'avatar')
        .orderBy('channelsUser.created_at', 'ASC')
        .limit(9)
        .getRawMany()
    )
      .map(u => u.avatar)
      .join(',');

    const member_count = await this.joinRepo.count({
      channel_id: channelId,
      deleted: false,
    });
    await this.repo
      .createQueryBuilder()
      .update(Channel)
      .set({ member_count: Number(member_count), avatar })
      .where({ id: channelId })
      .setParameters({ channel_id: channelId, deleted: false })
      .execute();

    await this.emitService.emitToRoom({
      room: channelId,
      event: 'channel:push-update',
      data: { channelId, attrs: { avatar, member_count } },
    });

    return { avatar, member_count };
  }

  async removeUsersFromChannel(params: RemoveUserParams): Promise<any> | never {
    const channelId: number = Number(params.channelId);
    const { operatorId, channelType, client_id } = params;
    const userIds = [...new Set(params.userIds)];

    // 要移除群主 且 群成员数量大于1 则 禁止
    if (
      (await this.repo.count({
        id: channelId,
        type: ChannelType.GROUP,
        owner_id: In(userIds),
        member_count: MoreThan(1),
      })) > 0
    ) {
      throw new Error(Code.CHANNEL_REMOVE_OWNER_FORBIDDEN);
    }

    // 判断是否存在已被删除的成员
    const isMember =
      (await this.joinRepo.count({
        user_id: In(userIds),
        channel_id: channelId,
        deleted: false,
      })) === userIds.length;
    if (!isMember) {
      throw new Error(Code.CHANNEL_NOT_MEMBER);
    }

    await this.joinRepo.update(
      {
        channel_id: channelId,
        user_id: In(userIds),
      },
      {
        deleted: true,
        deleted_at: new Date(),
      },
    );

    // 通知群里所有用户
    if (channelType === ChannelType.GROUP) {
      await this.emitService.emitToRoom({
        room: channelId,
        event: 'channel:push-removeUser',
        data: {
          channelId,
          userIds,
        },
      });
    }

    if (channelType === ChannelType.GROUP) {
      // 通知被踢者
      if (String(operatorId) !== String(userIds)) {
        const [operated, operator] = await Promise.all([
          this.getMembers({
            channel_id: channelId,
            user_id: In(userIds),
          }),
          this.getOperator(channelId, operatorId),
        ]);
        await this.messageService.specialMsgSave({
          type: MessageType.LEAVE_ROOM,
          client_id,
          channelId,
          userId: operatorId,
          content: JSON.stringify({
            operator,
            operated,
          }),
          nickname: operator.nickname,
          avatar: operator.avatar,
        });
      }
      // 推送新的群信息给在线群成员
      await this.updateForMembersChange(channelId);
    }
    const sids = await this.clientService.getSidByUserIds(userIds);
    await this.emitService.leaveRoom({ room: channelId, socketIds: sids });
  }

  private async addUsersToChannel(params: AddUserParams): Promise<any> | never {
    const { operatorId, client_id, userIds, viaQrcode, viaLink } = params;

    if (!params.channelId || !userIds || userIds.length < 1) {
      throw new Error(Code.COMMON_PARAMS_INVALID);
    }

    const uIds = await this.userService.getNormalIds(userIds);
    if (!uIds || uIds.length < 1) {
      throw new Error(Code.COMMON_TARGET_NOT_EXIST);
    }

    // make sure channelId is integer
    const channelId = Number(params.channelId);

    const channel = params.channel || (await this.findOneGroup({ channelId }));
    // 群人数上限检查
    if (
      Number(channel.member_count + uIds.length) >
      Number(channel.member_count_limit)
    ) {
      throw new Error(Code.CHANNEL_REACH_MEMBER_COUNT_LIMIT);
    }
    const existsJoins = await this.joinRepo.find({
      channel_id: channelId,
      user_id: In(uIds),
    });

    // 重复邀请 重复扫码
    if (existsJoins.some(e => !e.deleted)) {
      throw new Error(Code.CHANNEL_MEMBERSHIP_EXISTS);
    }

    const joins = uIds.map(user_id => {
      const join =
        existsJoins.find(j => j.user_id === user_id) || this.joinRepo.create();
      this.joinRepo.merge(join, {
        user_id,
        channel_id: channelId,
        msg_count: 0,
        unread_msg_count: 0,
        last_viewed_at: new Date(),
        deleted: false,
        remark_nickname: null,
        memo_alias: null,
        memo_alias_pinyin: null,
        memo_phone: null,
        muted: false,
        deleted_at: null,
        blacklisted: false,
        // 后续会发送消息，此处提前加一
        seq_start: channel.seq_end,
      });
      return join;
    });

    await this.joinRepo.save(joins);

    // 发送
    const [channelUsers, operator, sids, updatedFields] = await Promise.all([
      this.groupMembersQuery({
        channel_id: channelId,
        user_id: In(uIds),
      }).getRawMany(),
      this.getOperator(channelId, operatorId),
      this.clientService.getSidByUserIds(uIds),
      this.updateForMembersChange(channelId),
    ]);

    // 操作被加入成员
    if (sids.length > 0) {
      await Promise.all([
        // 服务端将新用户 join room
        this.emitService.joinRoom({
          room: channelId,
          socketIds: sids,
        }),
        // 向新用户推加入群
        this.emitService.emitToSockets({
          event: 'channel:push-addNew',
          socketIds: sids,
          data: {
            channel: {
              ...channel,
              seq_start: channel.seq_end,
              seq_end: channel.seq_end + 1,
              ...updatedFields,
            },
          },
        }),
      ]);
    }
    // 通知其它已存在成员
    await Promise.all([
      // 将新用户推给群里其他人
      this.emitService.emitToRoom({
        room: channelId,
        event: 'channel:push-addUser',
        data: { channelId, channelUsers },
      }),
      // 通知群内用户有新用户加入
      this.messageService.specialMsgSave({
        type: viaQrcode
          ? MessageType.JOIN_ROOM_QRCODE
          : viaLink
          ? MessageType.JOIN_ROOM_LINK
          : MessageType.JOIN_ROOM_INVITE,
        client_id,
        channelId,
        userId: operatorId,
        content: JSON.stringify({
          operator,
          operated: channelUsers.map(c =>
            pick(c, ['user_id', 'uid', 'avatar', 'gender', 'nickname']),
          ),
        }),
        nickname: operator.nickname,
        avatar: operator.avatar,
      }),
    ]);
    return channelUsers;
  }

  private queryPage({
    query,
    pageNum,
    pageSize,
    options = {},
  }: {
    query: any;
    pageNum: number;
    pageSize: number;
    options?: any;
  }): Promise<any> {
    if (options.orderBy) {
      query.orderBy(options.orderBy);
    }
    return Promise.all([
      query.getCount(),
      query
        .skip((pageNum - 1) * pageSize)
        .take(pageSize)
        .getRawMany(),
    ]).then(values => {
      return { totalCount: values[0], data: values[1] };
    });
  }

  // 群组添加用户
  async addUserToGroup(params: AddUserParams): Promise<any> | never {
    try {
      const {
        operatorId,
        channelId,
        userIds,
        viaQrcode,
        viaLink,
        code,
      } = params;

      if (userIds.includes(operatorId) && !viaLink) {
        throw new Error(Code.COMMON_PARAMS_INVALID);
      }
      const channel = await this.findOneGroup({
        channelId,
        code,
      });
      if (
        channel.settings.ownerInviteOnly &&
        (viaQrcode || viaLink || channel.owner_id !== operatorId)
      ) {
        throw new Error(Code.COMMON_NO_PERMISSION);
      }

      if (!(await this.isMember(operatorId, channelId)) && !viaLink) {
        throw new Error(Code.CHANNEL_NOT_MEMBER);
      }
      // 确保channelId 存在
      params.channelId = channel.id;
      return await this.addUsersToChannel({ ...params, channel });
    } catch (error) {
      throw error;
    }
  }

  // 从群组中移除用户 | 退出当前群 | 删除好友
  async channelRemoveUser(params: RemoveUserParams): Promise<any> | never {
    const { channelId, userIds, operatorId } = params;
    try {
      const hasPermission =
        String(operatorId) === String(userIds)
          ? await this.isMember(operatorId, channelId)
          : await this.isOwnerOrManager(operatorId, channelId);

      if (!hasPermission) {
        throw new Error(Code.COMMON_NO_PERMISSION);
      }
      return await this.removeUsersFromChannel(params);
    } catch (error) {
      throw error;
    }
  }

  // 更新channel信息 群名称/群公告/消息免打扰/群头像
  async channelUpdate({
    operatorId,
    channelId,
    attrs,
    client_id,
  }: {
    operatorId: number;
    channelId: number;
    attrs: any;
    client_id: number;
  }): Promise<any> | never {
    try {
      const fields = pick(attrs, [
        'name',
        'announcement',
        'avatar',
        'settings',
      ]) as any;
      const joinField = pick(attrs, [
        'memo_alias',
        'memo_phone',
        'blacklisted',
        'remark_nickname',
        'muted',
      ]) as ChannelsUser;
      if (joinField.memo_alias) {
        joinField.memo_alias_pinyin = getPinyin(joinField.memo_alias);
      }

      if (isEmpty(fields) && isEmpty(joinField)) {
        return;
      }

      if (fields.name && getStringLengthForChinese(attrs.name) > 16) {
        throw new Error(Code.CHANNEL_NAME_TOO_LONG);
      }

      // membership check
      if (!(await this.isMember(operatorId, channelId))) {
        throw new Error(Code.CHANNEL_NOT_MEMBER);
      }
      // Perform the update
      if (!isEmpty(fields)) {
        // Only owner has permission to change name announcement settings
        if (
          fields.hasOwnProperty('name') ||
          fields.hasOwnProperty('announcement') ||
          !isEmpty(fields.settings)
        ) {
          if (!(await this.isOwnerOrManager(operatorId, channelId))) {
            throw new Error(Code.COMMON_NO_PERMISSION);
          }
        }

        const { type, settings } = await this.repo.findOne(
          { id: channelId },
          { select: ['type', 'settings'] },
        );
        if (type !== 'g') throw new Error(Code.COMMON_NO_PERMISSION);

        if (!isEmpty(fields.settings)) {
          fields.settings = { ...settings, ...fields.settings };
        }

        if (fields.hasOwnProperty('announcement')) {
          fields.announcement_posted_at = new Date();
        }
        await this.repo.update(channelId, fields);

        // 推送消息
        const [operator] = await Promise.all([
          this.getOperator(channelId, operatorId),
          // 推送更新后的channel信息
          this.emitService.emitToRoom({
            room: channelId,
            event: 'channel:push-update',
            data: { channelId, attrs: fields },
          }),
        ]);
        if (!isEmpty(fields.settings)) {
          if (settings.ownerInviteOnly !== fields.settings.ownerInviteOnly) {
            // 群聊邀请确认开关
            this.messageService
              .specialMsgSave({
                type: MessageType.CHANNEL_OWNER_INVITE,
                client_id,
                channelId: Number(channelId),
                userId: operatorId,
                content: JSON.stringify({
                  operator,
                  ownerInviteOnly: fields.settings.ownerInviteOnly,
                }),
                nickname: operator.nickname,
                avatar: operator.avatar,
              })
              .catch(error => {
                captureException(error);
              });
          }
          if (settings.banned !== fields.settings.banned) {
            // 群聊全员禁言
            this.messageService
              .specialMsgSave({
                type: MessageType.CHANNEL_BANNED,
                client_id,
                channelId: Number(channelId),
                userId: operatorId,
                content: JSON.stringify({
                  operator,
                  banned: fields.settings.banned,
                }),
                nickname: operator.nickname,
                avatar: operator.avatar,
              })
              .catch(error => {
                captureException(error);
              });
          }
          if (fields.settings.memberMasked !== settings.memberMasked) {
            // 群成员封闭
            this.messageService
              .specialMsgSave({
                type: MessageType.CHANNEL_MEMBER_MASKED,
                client_id,
                channelId: Number(channelId),
                userId: operatorId,
                content: JSON.stringify({
                  operator,
                  memberMasked: fields.settings.memberMasked,
                }),
                nickname: operator.nickname,
                avatar: operator.avatar,
              })
              .catch(error => {
                captureException(error);
              });
          }
        }
        if (fields.hasOwnProperty('name')) {
          this.messageService
            .specialMsgSave({
              type: MessageType.CHANNEL_NAME_CHANGED,
              client_id,
              channelId: Number(channelId),
              userId: operatorId,
              content: JSON.stringify({
                operator,
                content: `"修改群名称为"${fields.name}`,
              }),
              nickname: operator.nickname,
              avatar: operator.avatar,
            })
            .catch(error => {
              console.error(error);
              captureException(error);
            });
        }
        if (fields.hasOwnProperty('announcement')) {
          this.messageService
            .specialMsgSave({
              type: MessageType.TEXT,
              client_id,
              channelId: Number(channelId),
              userId: operatorId,
              content: `@所有人\n${fields.announcement}`,
              nickname: operator.nickname,
              avatar: operator.avatar,
              mention: [{ user_id: 0 }],
            })
            .catch(error => {
              console.error(error);
              captureException(error);
            });
        }
      }

      if (!isEmpty(joinField)) {
        await this.joinRepo.update(
          { channel_id: channelId, user_id: operatorId },
          joinField,
        );
      }
    } catch (error) {
      throw error;
    }
  }
  // 获取用户channelIds
  async fetchChannelIds(userId: number): Promise<string[]> | never {
    return (
      await this.joinRepo
        .createQueryBuilder('channelsUser')
        .leftJoinAndSelect('channelsUser.channel', 'channel')
        .select('channel.id', 'id')
        .where(
          'channelsUser.user_id = :userId AND channel.status = :channelStatus',
          { userId, channelStatus: ChannelStatus.NORMAL },
        )
        .andWhere('deleted = :deleted', { deleted: false })
        .getRawMany()
    ).map(p => String(p.id));
  }

  // 拉取某个用户的 channel 列表
  async fetchForUser(
    userId: number,
    lastUpdatedAt?: string,
  ): Promise<any[]> | never {
    const updatedAt = new Date(lastUpdatedAt || 0);
    const [channels, systemChannel] = await Promise.all([
      this.getPB()
        .where('channelsUser.user_id = :userId', { userId })
        .andWhere('deleted = false')
        .andWhere('channel.status = :channelStatus', {
          channelStatus: ChannelStatus.NORMAL,
        })
        .andWhere(
          '(channel.updated_at > :lastUpdatedAt OR channelsUser.updated_at > :lastUpdatedAt)',
          {
            lastUpdatedAt: updatedAt,
          },
        )
        .addSelect(
          'GREATEST(channel.updated_at, channelsUser.updated_at)',
          'updated_at',
        )
        .orderBy('channel.created_at', 'DESC')
        .getRawMany(),
      this.getSystemMsgChannel(userId),
    ]);
    // 添加青派助手
    if (systemChannel.updated_at > updatedAt) channels.push(systemChannel);
    return channels.map(c => pickBy(c, i => !isNull(i)));
  }

  // TODO: move to user service;
  async getNicknameByUserIds(userIds: number[]): Promise<any[]> | never {
    return await this.userRepo.find({
      select: ['nickname'],
      where: { id: In(userIds) },
    });
  }

  // 获取操作者信息 用于展示推送消息
  async getOperator(channelId: number, operatorId: number): Promise<any> {
    const [operator] = await this.getMembers({
      channel_id: channelId,
      user_id: operatorId,
    });
    return operator || OPERATOR_ADMIN;
  }

  // 群组移除，添加，退出的消息提醒需要的nickname
  private async getMembers(filter: any): Promise<any> {
    return await this.joinRepo
      .createQueryBuilder('channelsUser')
      .leftJoinAndSelect('channelsUser.user', 'user')
      .where(filter)
      .andWhere('user.state = :userState', { userState: UserState.NORMAL })
      .select(
        // tslint:disable-next-line: quotemark
        "coalesce(NULLIF(channelsUser.remark_nickname, ''), NULLIF(user.nickname, ''), '')",
        'nickname',
      )
      .addSelect('channelsUser.banned', 'banned')
      .addSelect('user.id', 'user_id')
      .addSelect('user.uid', 'uid')
      .addSelect('user.gender', 'gender')
      .addSelect('user.avatar', 'avatar')
      .getRawMany();
  }

  // 私有 口径
  private groupMembersQuery(filter: any): SelectQueryBuilder<ChannelsUser> {
    return (
      this.joinRepo
        .createQueryBuilder('channelsUser')
        .leftJoinAndSelect('channelsUser.user', 'user')
        .leftJoinAndSelect('channelsUser.channel', 'channel')
        .where(filter)
        .andWhere('user.state != :userState', { userState: UserState.DELETED })
        .select('user.id', 'user_id')
        .addSelect('channelsUser.id', 'id')
        .addSelect('channelsUser.banned', 'banned')
        .addSelect('channelsUser.role', 'role')
        .addSelect('channelsUser.updated_at', 'updated_at')
        .addSelect('user.uid', 'uid')
        .addSelect('user.gender', 'gender')
        // .addSelect('user.phone', 'phone')
        .addSelect(
          // tslint:disable-next-line:quotemark
          "CONCAT(left(user.phone,GREATEST(0,length(user.phone)-4)),'****')",
          'phone',
        )
        .addSelect('user.id = channel.owner_id', 'isOwner')
        .addSelect(
          // tslint:disable-next-line: quotemark
          "coalesce(NULLIF(channelsUser.remark_nickname, ''), NULLIF(user.nickname, ''), '')",
          'nickname',
        )
        .addSelect('user.avatar', 'avatar')
        .orderBy('"isOwner"', 'DESC')
    );
  }

  // 拉取某个group 的 成员 列表
  async fetchChannelUsers({
    operatorId,
    channelId,
    getAll,
    lastUpdatedAt,
  }: {
    operatorId: number;
    channelId: number;
    getAll?: boolean;
    lastUpdatedAt?: string;
  }): Promise<any> | never {
    if (await this.isMember(operatorId, channelId)) {
      const date = lastUpdatedAt && new Date(lastUpdatedAt);
      const filter = { channel_id: channelId, deleted: false } as any;
      const result = { members: [], deleted: [] };
      // 如果传入合法日期，则增量获取
      if (date && !isNaN(date.getDate())) {
        filter.updated_at = MoreThan(date);
      }
      const pb = this.groupMembersQuery(filter).orderBy('role', 'ASC');
      // 打开群信息时，默认显示3排(15个)
      // 客户端不可存储返回结果中筛选出的最近日期，因为此日期是被截断的。
      if (!getAll) {
        pb.limit(15);
      }
      result.members = await pb.getRawMany();
      // 被移出的成员只在获取全量场景下做增量查询
      if (getAll && filter.updated_at) {
        filter.deleted = true;
        result.deleted = (
          await this.joinRepo.find({
            select: ['id'],
            where: filter,
          })
        ).map(x => x.id);
      }
      // 兼容处理，传此字段返回新数据格式
      if (lastUpdatedAt) {
        return result;
      }
      // 返回旧数据格式
      return result.members;
    }
    throw new Error(Code.CHANNEL_NOT_MEMBER);
  }

  // 获取一个channel 信息
  async findOneDirect(channelId: number, userId: number): Promise<any> | never {
    return await this.getPB()
      .where(
        'channelsUser.channel_id = :channelId AND channelsUser.user_id = :userId AND channel.status = :channelStatus',
        {
          channelId,
          userId,
          channelStatus: ChannelStatus.NORMAL,
        },
      )
      .andWhere('blacklisted = :blacklisted', { blacklisted: false })
      .getRawOne();
  }

  // 获取推送字段
  private async findOneGroup({
    channelId,
    channelEntity,
    code,
  }: {
    channelId?: number;
    channelEntity?: any;
    code?: string;
  }): Promise<any> | never {
    const conditions = code ? { code } : { id: channelId };
    const channel = channelEntity
      ? pick(channelEntity, GROUP_FIELDS)
      : await this.repo.findOne(conditions, {
          select: GROUP_FIELDS as [],
        });
    return { ...channel, muted: false, unread_msg_count: 0 };
  }

  // 发送/撤回消息时要更新channel状态
  async updateState({
    message,
    channelId,
    withdraw = false,
  }: {
    message?: any;
    channelId?: number;
    withdraw?: boolean;
  }): Promise<any> {
    // Get the latest one if not pass message
    message = message || (await this.messageService.getLatestMsg(channelId));
    const {
      channel_id,
      nickname,
      user_id,
      content,
      file,
      created_at,
      type,
      last_msg,
      mention = [],
    } = message;
    const [channel, { locale }, [channelUser]] = await Promise.all([
      this.repo.findOne(channel_id, {
        select: ['id', 'type', 'total_msg_count', 'seq_end'],
      }),
      this.userRepo.findOne(user_id, {
        select: ['locale'],
      }),
      this.joinRepo.find({
        select: ['id', 'last_msg'],
        where: { channel_id, user_id },
      }),
    ]);

    const promise = [];
    let lastMsg = '';

    if (file) {
      const phrase = AUDIO_EXTENSION_PATTERN.test(file) ? 'audio' : 'image';
      lastMsg = `[${i18n.__({ phrase, locale })}]`;
      // 如果是群，显示发送者nickname
      if (channel.type === ChannelType.GROUP) {
        lastMsg = `${nickname}: ${lastMsg}`;
      }
    }
    if (type === MessageType.CONTAIN_AT) {
      const userIds = mention.map(t => t.userId);
      const filter = userIds.includes(0)
        ? { channel_id: channel.id }
        : { channel_id: channel.id, user_id: In([...new Set(userIds)]) };
      this.joinRepo.update(filter, {
        mention_count: () => 'mention_count + 1',
      });
    }

    if (['friend_accept_me', 'i_accept_friend'].includes(type)) {
      channelUser.last_msg = file
        ? truncate(lastMsg)
        : truncate(
            this.parseLastMsg({
              lastMsg: last_msg ? last_msg : content,
              msgType: type,
              channelType: channel.type,
              nickname: nickname || '',
              locale,
            }),
          );
      channelUser.last_msg_at = created_at;
      promise.push(channelUser.save());
    } else {
      // 如果是单聊，为保证获取的last_msg是最新的，成为好友后发送消息时重置channelUser的last_msg字段
      if (channelUser.last_msg && channel.type === 'd') {
        promise.push(
          this.joinRepo.update(
            {
              channel_id: channel.id,
            },
            {
              last_msg: null,
              last_msg_at: null,
            },
          ),
        );
      }
      channel.last_msg = file
        ? truncate(lastMsg)
        : truncate(
            this.parseLastMsg({
              lastMsg: content,
              msgType: type,
              channelType: channel.type,
              nickname: nickname || '',
              locale,
            }),
          );
      channel.last_msg_at = created_at;
    }
    // 好友请求消息只需在i_accept_friend时执行update,以避免重复计算msg_count
    if (type !== 'friend_accept_me') {
      if (withdraw) {
        channel.total_msg_count = Math.max(channel.total_msg_count - 1, 0);
      } else {
        channel.total_msg_count = Math.max(channel.total_msg_count + 1, 0);
        // channel.seq_end = message.seq;
      }

      const members = await this.joinRepo
        .createQueryBuilder('channelsUser')
        .where('channelsUser.channel_id = :channel_id', { channel_id })
        .andWhere('channelsUser.deleted != :deleted', { deleted: true })
        .select('channelsUser.id', 'joinId')
        .addSelect('channelsUser.opened', 'opened')
        .getRawMany();
      const { opened, closed } = members.reduce(
        (collector, member) => {
          const status = member.opened ? 'opened' : 'closed';
          collector[status].push(member.joinId);
          return collector;
        },
        { closed: [], opened: [] },
      );
      const msgCountFn = withdraw
        ? () => 'GREATEST("msg_count" - 1, 0)'
        : () => 'GREATEST("msg_count" + 1, 0)';
      const unreadMsgCountFn = withdraw
        ? () => 'GREATEST("unread_msg_count" - 1, 0)'
        : () => 'GREATEST("unread_msg_count" + 1, 0)';
      promise.push(channel.save());
      promise.push(
        new Promise((resolve, reject) => {
          if (closed.length === 0) return resolve();
          const updateFields = {
            msg_count: msgCountFn,
            unread_msg_count: unreadMsgCountFn,
          } as any;
          // 修改群公告会@所有人，更新mention_count
          if (mention.some(x => x.user_id === 0)) {
            updateFields.mention_count = () => 'mention_count + 1';
          }
          this.joinRepo
            .createQueryBuilder()
            .update()
            .set(updateFields)
            .where({ id: In(closed) })
            .execute()
            .then(() => resolve())
            .catch(error => reject(error));
        }),
      );
      promise.push(
        new Promise((resolve, reject) => {
          if (opened.length === 0) return resolve();
          this.joinRepo
            .createQueryBuilder()
            .update()
            .set({
              msg_count: msgCountFn,
              last_viewed_at: created_at,
            })
            .where({ id: In(opened) })
            .execute()
            .then(() => resolve())
            .catch(error => reject(error));
        }),
      );
    }
    await Promise.all(promise);
  }

  // 根据 seq 获取未读消息
  async getUnreadMsgBySeq({
    channelId,
    userId,
    seqStart,
    seqEnd,
  }): Promise<any> | never {
    try {
      const inChannel =
        (await this.joinRepo.count({
          user_id: userId,
          channel_id: channelId,
          deleted: false,
        })) > 0;
      if (!inChannel) {
        return [];
      }

      return await this.messageService.getBySeq({
        channelId,
        seqStart,
        seqEnd,
      });
    } catch (error) {
      throw error;
    }
  }

  // 将某个channel标志为已读
  async markAsRead(userId: number, channelId: number): Promise<any> | never {
    try {
      const { last_viewed_at: lastViewedAt } = await this.joinRepo.findOne({
        where: { user_id: userId, channel_id: channelId },
        select: ['last_viewed_at'],
      });
      const [withdrawMsgIds] = await Promise.all([
        this.messageService.getWithdrawMsgIds(channelId, lastViewedAt),
        this.joinRepo.update(
          {
            user_id: userId,
            channel_id: channelId,
          },
          {
            unread_msg_count: 0,
            last_viewed_at: new Date(),
            opened: true,
            mention_count: 0,
          },
        ),
      ]);
      return withdrawMsgIds;
    } catch (error) {
      throw error;
    }
  }

  // 离开channel时改变channel状态
  async markClosed(userId: number, channelId?: number) {
    try {
      if (!userId) return;
      const condition: any = { user_id: userId, opened: true };
      if (channelId) condition.channel_id = channelId;
      await this.joinRepo.update(condition, { opened: false });
    } catch (error) {
      throw error;
    }
  }

  // jpush推送获取title信息
  async getPushInfo(
    senderId: number,
    channelId: number,
  ):
    | Promise<{ title: string; alias: string[]; channelType: ChannelType }>
    | never {
    try {
      const { type, name } = await this.repo.findOne({
        select: ['type', 'name'],
        where: { id: channelId },
      });
      // 获取开启了个人消息推送和channel消息推送,并且没有打开当前channel的用户
      if (type === ChannelType.GROUP) {
        const result = await this.joinRepo
          .createQueryBuilder('channelsUser')
          .leftJoinAndSelect('channelsUser.user', 'receiver')
          .select('receiver.uid', 'uid')
          .where('channelsUser.channel_id = :channelId', { channelId })
          .andWhere('channelsUser.user_id <> :senderId', { senderId })
          .andWhere('channelsUser.muted = :muted', { muted: false })
          .andWhere('channelsUser.deleted = :deleted', { deleted: false })
          .andWhere('channelsUser.opened <> :opened', { opened: true })
          // tslint:disable-next-line: quotemark
          .andWhere("receiver.notify_setting -> 'push' = 'true'")
          .getRawMany();
        return {
          title: name,
          alias: result.map(c => c.uid),
          channelType: type,
        };
      } else if (type === ChannelType.DIRECT) {
        // tslint:disable-next-line: no-shadowed-variable
        const { title = '', uid = '' } =
          (await this.joinRepo
            .createQueryBuilder('channelsUser')
            .leftJoinAndSelect('channelsUser.user', 'receiver')
            .leftJoinAndSelect(
              'users',
              'sender',
              'channelsUser.friend_id = sender.id',
            )
            .select('receiver.uid', 'uid')
            .addSelect(
              'coalesce(channelsUser.memo_alias, sender.nickname)',
              'title',
            )
            .where('channelsUser.channel_id = :channelId', { channelId })
            .andWhere('channelsUser.friend_id = :senderId', { senderId })
            .andWhere('channelsUser.muted = :muted', { muted: false })
            .andWhere('channelsUser.deleted = :deleted', { deleted: false })
            .andWhere('channelsUser.opened <> :opened', { opened: true })
            // tslint:disable-next-line: quotemark
            .andWhere("receiver.notify_setting -> 'push' = 'true'")
            .getRawOne()) || {};
        return { title, alias: uid ? [uid] : [], channelType: type };
      }
    } catch (error) {
      throw error;
    }
  }

  private getPB(): SelectQueryBuilder<ChannelsUser> {
    return this.joinRepo
      .createQueryBuilder('channelsUser')
      .leftJoinAndSelect('channelsUser.channel', 'channel')
      .leftJoinAndSelect('channelsUser.friend', 'friend')
      .leftJoinAndSelect('channelsUser.user', 'user')
      .select('channel.id', 'id')
      .addSelect('channel.code', 'code')
      .addSelect('channel.announcement', 'announcement')
      .addSelect('channel.announcement_posted_at', 'announcement_posted_at')
      .addSelect(
        // tslint:disable-next-line: quotemark
        "coalesce(NULLIF(channel.name, ''), NULLIF(channelsUser.memo_alias, ''), NULLIF(friend.nickname, ''), '')",
        'name',
      )
      .addSelect(
        // tslint:disable-next-line: quotemark
        "coalesce(NULLIF(channel.avatar, ''), NULLIF(friend.avatar, ''), '')",
        'avatar',
      )
      .addSelect('channel.type', 'type')
      .addSelect('channel.status', 'status')
      .addSelect('channel.owner_id', 'owner_id')
      .addSelect('channel.member_count', 'member_count')
      .addSelect('channel.settings', 'settings')
      .addSelect(
        "coalesce(NULLIF(channelsUser.last_msg, ''), NULLIF(channel.last_msg, ''), '')",
        'last_msg',
      )
      .addSelect(
        'coalesce(channelsUser.last_msg_at, channel.last_msg_at, now())',
        'last_msg_at',
      )
      .addSelect('channel.seq_end', 'seq_end')
      .addSelect('channelsUser.msg_count', 'msg_count')
      .addSelect('channelsUser.unread_msg_count', 'unread_msg_count')
      .addSelect('channelsUser.muted', 'muted')
      .addSelect('channelsUser.memo_alias', 'memo_alias')
      .addSelect('channelsUser.memo_phone', 'memo_phone')
      .addSelect('channelsUser.blacklisted', 'blacklisted')
      .addSelect('channelsUser.seq_start', 'seq_start')
      .addSelect('channelsUser.banned', 'banned')
      .addSelect('channelsUser.role', 'role')
      .addSelect('channelsUser.mention_count', 'mention_count')
      .addSelect('friend.id', 'user_id')
      .addSelect('friend.uid', 'uid')
      .addSelect(
        "coalesce(NULLIF(friend.nickname, ''), NULLIF(channelsUser.remark_nickname, ''), NULLIF(user.nickname, ''), '')",
        'nickname',
      )
      .addSelect('friend.phone', 'phone')
      .addSelect('friend.gender', 'gender')
      .addSelect(
        // tslint:disable-next-line: quotemark
        "coalesce(NULLIF(channelsUser.memo_alias_pinyin, ''), NULLIF(friend.nickname_pinyin, ''), '')",
        'pinyin',
      );
  }

  async isOwner(userId: number, channelId: number): Promise<boolean> {
    return (
      (await this.repo.count({
        id: channelId,
        owner_id: userId,
        type: ChannelType.GROUP,
      })) > 0
    );
  }

  // 管理员或群主
  async isOwnerOrManager(userId: number, channelId: number): Promise<boolean> {
    return (
      (await this.joinRepo.count({
        channel_id: channelId,
        user_id: userId,
        deleted: false,
        role: In([ChannelUserRole.MANAGER, ChannelUserRole.OWNER]),
      })) > 0
    );
  }

  private async isMember(userId: number, channelId: number): Promise<boolean> {
    return (
      (await this.joinRepo.count({
        channel_id: channelId,
        user_id: userId,
        deleted: false,
      })) > 0
    );
  }

  async isBlocked(channelId: number): Promise<boolean> {
    return (
      (await this.repo.count({
        id: channelId,
        status: ChannelStatus.BLOCKED,
      })) > 0
    );
  }

  // 判断是否为好友
  async isFriend(fromId: number, toId: number): Promise<boolean> | never {
    return (
      (await this.joinRepo.count({
        user_id: In([fromId, toId]),
        friend_id: In([fromId, toId]),
        deleted: false,
        blacklisted: false,
      })) === 2
    );
  }

  // [admin] 获取用户好友列表
  async getUserFriendsList(params: FindFriendsParams): Promise<any> | never {
    try {
      const { userId, keyword } = params;
      let { pageNum = DEFAULT_PAGE_NUM, pageSize = DEFAULT_PAGE_SIZE } = params;
      pageNum = Math.max(pageNum, DEFAULT_PAGE_NUM);
      pageSize = Math.min(pageSize, MAX_PAGE_SIZE);
      const qb = this.joinRepo
        .createQueryBuilder('channelsUser')
        .leftJoinAndSelect('channelsUser.friend', 'friend')
        .select('channelsUser.id', 'id')
        .addSelect('channelsUser.memo_alias', 'memo_alias')
        .addSelect('friend.id', 'friend_id')
        .addSelect('friend.uid', 'uid')
        .addSelect('friend.nickname', 'nickname')
        .addSelect('friend.avatar', 'avatar')
        .where(
          'channelsUser.user_id = :userId and channelsUser.friend_id is not null',
          { userId },
        )
        .andWhere(
          'channelsUser.blacklisted = FALSE and channelsUser.deleted = FALSE',
        );
      if (keyword) {
        qb.andWhere(
          '(friend.uid LIKE :keyword OR friend.nickname LIKE :keyword)',
          {
            keyword: `${keyword}%`,
          },
        );
      }
      const totalCount = await qb.getCount();
      const totalPage = Math.ceil(totalCount / pageSize);
      let data = [];
      if (pageNum <= totalPage) {
        data = await qb
          .orderBy('channelsUser.created_at', 'DESC')
          .offset((pageNum - 1) * pageSize)
          .limit(pageSize)
          .getRawMany();
      }
      return { totalCount, data };
    } catch (error) {
      throw error;
    }
  }

  // [admin] 获取用户黑名单列表
  async getUserBlacklist(params: FindFriendsParams): Promise<any> | never {
    try {
      const { userId, keyword } = params;
      let { pageNum = DEFAULT_PAGE_NUM, pageSize = DEFAULT_PAGE_SIZE } = params;
      pageNum = Math.max(pageNum, DEFAULT_PAGE_NUM);
      pageSize = Math.min(pageSize, MAX_PAGE_SIZE);
      const qb = this.joinRepo
        .createQueryBuilder('channelsUser')
        .leftJoinAndSelect('channelsUser.friend', 'friend')
        .select('channelsUser.id', 'id')
        .addSelect('channelsUser.memo_alias', 'memo_alias')
        .addSelect('friend.id', 'friend_id')
        .addSelect('friend.uid', 'uid')
        .addSelect('friend.nickname', 'nickname')
        .where(
          'channelsUser.user_id = :userId and channelsUser.friend_id is not null and channelsUser.blacklisted = TRUE',
          { userId },
        );
      if (keyword) {
        qb.andWhere(
          '(friend.uid LIKE :keyword OR friend.nickname LIKE :keyword)',
          {
            keyword: `${keyword}%`,
          },
        );
      }
      const totalCount = await qb.getCount();
      const totalPage = Math.ceil(totalCount / pageSize);
      let data = [];
      if (pageNum <= totalPage) {
        data = await qb
          .orderBy('channelsUser.created_at', 'DESC')
          .offset((pageNum - 1) * pageSize)
          .limit(pageSize)
          .getRawMany();
      }
      return { totalCount, data };
    } catch (error) {
      throw error;
    }
  }

  // [admin] 群列表
  async searchGroups(
    keyword: string = '',
    pageNum: number = DEFAULT_PAGE_NUM,
    pageSize: number = DEFAULT_PAGE_SIZE,
  ): Promise<any> | never {
    const dataQuery = this.repo
      .createQueryBuilder('channel')
      .leftJoin('channel.owner', 'owner')
      .select('channel.id', 'id')
      .addSelect('channel.name', 'name')
      .addSelect('channel.avatar', 'avatar')
      .addSelect('owner.nickname', 'owner_nickname')
      .addSelect('owner.avatar', 'owner_avatar')
      .addSelect('owner.uid', 'owner_uid')
      .addSelect('channel.total_msg_count', 'total_msg_count')
      .addSelect('channel.member_count', 'member_count')
      .addSelect('channel.member_count_limit', 'member_count_limit')
      .addSelect('channel.status', 'status')
      .addSelect('channel.owner_id', 'owner_id')
      .addSelect('channel.announcement ', 'announcement')
      .addSelect('channel.announcement_posted_at', 'announcement_posted_at')
      .addSelect('channel.complaint_times', 'complaint_times')
      .addSelect('channel.created_at', 'created_at')
      .addSelect('channel.settings', 'settings')
      .where(`channel.name LIKE '%${keyword}%'`)
      .andWhere('channel.type = :type', { type: 'g' })
      .andWhere('channel.status <> :status', { status: ChannelStatus.DELETED });

    try {
      return await this.queryPage({
        query: dataQuery,
        pageNum,
        pageSize,
        options: {
          orderBy: {
            'channel.created_at': 'DESC',
          },
        },
      });
    } catch (error) {
      throw error;
    }
  }

  // [admin] 创建群组
  async createGroupCommon(params: GroupInput): Promise<any> | never {
    let ownerId;
    if (params.owner_uid) {
      const result = await this.userRepo.findOne({
        select: ['id'],
        where: { uid: params.owner_uid },
      });
      if (!result) throw new Error(Code.COMMON_TARGET_NOT_EXIST);
      ownerId = result.id;
    } else {
      ownerId = params.ownerId || params.creatorId;
    }
    if (!ownerId) throw new Error(Code.COMMON_PARAMS_MISSING);
    const mIds = await this.userService.getNormalIds(params.memberIds);
    const memberIds = [...mIds, Number(ownerId)];
    const members = await this.userRepo.find({
      select: ['nickname', 'avatar'],
      where: { id: In(memberIds.slice(0, 9)) },
    });
    const name =
      params.name ||
      members
        .slice(0, 3)
        .map(x => x.nickname)
        .join('、');
    const avatar = members.map(u => u.avatar).join(',');
    const fields = {
      code: uid(20),
      name,
      avatar,
      type: ChannelType.GROUP,
      announcement: params.announcement,
      creator_id: params.creatorId,
      owner_id: ownerId,
      member_count: memberIds.length,
    } as any;
    if (params.member_count_limit) {
      Object.assign(fields, { member_count_limit: params.member_count_limit });
    }
    if (params.announcement) {
      fields.announcement_posted_at = new Date();
    }
    const entity = this.repo.create(fields) as any;
    entity.channelsUsers = memberIds.map(userId =>
      this.joinRepo.create({
        user_id: userId,
        role:
          userId === Number(ownerId)
            ? ChannelUserRole.OWNER
            : ChannelUserRole.MEMBER,
      }),
    );

    try {
      await entity.save();
      const channel = await this.findOneGroup({ channelEntity: entity });
      channel.seq_start = channel.seq_end;

      const sids = await this.clientService.getSidByUserIds(memberIds);

      await Promise.all([
        this.emitService.joinRoom({
          room: channel.id,
          socketIds: sids,
        }),
        this.emitService.emitToRoom({
          room: channel.id,
          event: 'channel:push-addNew',
          data: {
            channel,
          },
        }),
      ]);
      return channel;
    } catch (error) {
      throw error;
    }
  }

  // [admin] 修改群组信息/设置群主
  async updateGroup(channelId: number, attrs: any): Promise<any> | never {
    try {
      const fields = pick(attrs, [
        'name',
        'announcement',
        'member_count_limit',
        'owner_id',
        'status',
        'settings',
      ]);
      if (attrs.owner_uid) {
        const result = await this.userRepo.findOne({
          select: ['id'],
          where: { uid: attrs.owner_uid },
        });
        if (!result) throw new Error(Code.COMMON_TARGET_NOT_EXIST);
        fields.owner_id = result.id;
      }

      if (Object.keys(fields).length) {
        await Promise.all([
          this.repo.update({ id: channelId }, fields),
          this.updateOwnerRole(channelId, fields.owner_id),
          this.emitService.emitToRoom({
            room: channelId,
            event: 'channel:push-update',
            data: {
              channelId,
              attrs: fields,
            },
          }),
        ]);
      }
    } catch (error) {
      throw error;
    }
  }
  /// 后台管理员修改群主
  private async updateOwnerRole(
    channelId: number,
    ownerId?: number,
  ): Promise<any> | never {
    if (ownerId) {
      return await Promise.all([
        this.joinRepo.update(
          { channel_id: channelId, role: ChannelUserRole.OWNER },
          { role: ChannelUserRole.MEMBER },
        ),
        this.joinRepo.update(
          { channel_id: channelId, user_id: ownerId },
          { role: ChannelUserRole.MEMBER },
        ),
      ]);
    }
  }
  // [admin] 删除群
  async removeGroup(channelId: number): Promise<any> | never {
    try {
      channelId = Number(channelId);
      await Promise.all([
        this.repo.update(
          { id: channelId },
          {
            status: ChannelStatus.DELETED,
            deleted_at: new Date(),
          },
        ),
        this.joinRepo.update(
          { channel_id: channelId },
          { deleted: true, deleted_at: new Date() },
        ),
      ]);

      const userIds = (
        await this.joinRepo.find({
          select: ['user_id'],
          where: { channel_id: channelId },
        })
      ).map(p => p.user_id);
      // await this.emitService.emitToRoom({
      //   room: channelId,
      //   event: 'channel:push-leave',
      //   data: {
      //     channelId,
      //   },
      // });
      const sids = await this.clientService.getSidByUserIds(userIds);
      await this.emitService.leaveRoom({
        room: channelId,
        socketIds: sids,
      });
    } catch (error) {
      throw error;
    }
  }

  // [admin] 获取群成员
  async getGroupMembers(params: GetMembersParams): Promise<any> | never {
    const { channelId, keyword } = params;
    let { pageNum = DEFAULT_PAGE_NUM, pageSize = DEFAULT_PAGE_SIZE } = params;
    pageNum = Math.max(pageNum, DEFAULT_PAGE_NUM);
    pageSize = Math.min(pageSize, MAX_PAGE_SIZE);

    const filter = { channel_id: channelId, deleted: false };

    const query = await this.groupMembersQuery(filter);

    if (keyword) {
      query.andWhere(
        '(user.uid LIKE :keyword OR user.nickname LIKE :keyword)',
        {
          keyword: `${keyword}%`,
        },
      );
    }
    try {
      return await this.queryPage({
        query,
        pageNum,
        pageSize,
      });
    } catch (error) {
      throw error;
    }
  }

  // [admin] 添加群成员
  async addGroupMembers(
    channelId: number,
    userIds: number[],
  ): Promise<any> | never {
    try {
      return await this.addUsersToChannel({
        channelId,
        userIds,
        viaQrcode: false,
      });
    } catch (error) {
      throw error;
    }
  }

  // [admin] 移除成员
  async removeGroupMembers(
    channelId: number,
    userIds: number[],
  ): Promise<any> | never {
    try {
      return await this.removeUsersFromChannel({
        channelId,
        userIds,
        channelType: ChannelType.GROUP,
      });
    } catch (error) {
      throw error;
    }
  }

  private parseLastMsg({
    lastMsg,
    msgType,
    channelType,
    nickname,
    locale,
  }: {
    lastMsg: string;
    msgType: MessageType;
    channelType: ChannelType;
    nickname: string;
    locale: string;
  }): string | never {
    try {
      if (
        [
          MessageType.JOIN_ROOM_INVITE,
          MessageType.JOIN_ROOM_QRCODE,
          MessageType.JOIN_ROOM_LINK,
          MessageType.LEAVE_ROOM,
        ].includes(msgType)
      ) {
        const { operator, operated = [] } = JSON.parse(lastMsg);
        if (
          MessageType.LEAVE_ROOM === msgType &&
          operator.uid === operated[0].uid
        ) {
          return;
        }
        const operatedDesc = operated.map(op => op.nickname);
        return i18n.__(
          {
            phrase: `${msgType}_desc`,
            locale,
          },
          {
            nickname: operator.nickname,
            operatedDesc,
          },
        );
      } else if (
        [
          MessageType.CHANNEL_OWNER_INVITE,
          MessageType.CHANNEL_MEMBER_MASKED,
          MessageType.CHANNEL_BANNED,
          MessageType.CHANNEL_BAN_MEMBER,
          MessageType.WITHDRAW_BY_GROUP_OWNER,
          MessageType.WITHDRAW_BY_SENDER,
        ].includes(msgType)
      ) {
        return this.parseGroupSettingLastMsg(msgType, lastMsg, locale);
      } else if ('channel_name_changed' === msgType) {
        const { operator, content } = JSON.parse(lastMsg);
        return `${operator.nickname}${content}`;
      } else if (MessageType.CONTACT_CARD === msgType) {
        return `[${i18n.__({ phrase: 'contact_card', locale })}]`;
      } else if (MessageType.CONTAIN_AT === msgType) {
        const _name = channelType === 'd' ? null : `${nickname}:`;
        return truncate(`${_name}${JSON.parse(lastMsg).text}`);
      } else {
        return channelType === ChannelType.DIRECT
          ? lastMsg
          : `${nickname}: ${lastMsg}`;
      }
    } catch (error) {
      return channelType === ChannelType.DIRECT
        ? lastMsg
        : `${nickname}: ${lastMsg}`;
    }
  }

  private parseGroupSettingLastMsg = (
    type: string,
    lastMsg: string,
    locale?: string,
  ) => {
    const { operator, ownerInviteOnly, banned, memberMasked } = JSON.parse(
      lastMsg,
    );
    const phrase = (() => {
      switch (type) {
        case MessageType.CHANNEL_OWNER_INVITE:
          return `channel_setting_owner_invite_${!!ownerInviteOnly}`;
        case MessageType.CHANNEL_BANNED:
          return `channel_setting_banned_${!!banned}`;
        case MessageType.CHANNEL_MEMBER_MASKED:
          return `channel_setting_member_masked_${!!memberMasked}`;
        case MessageType.CHANNEL_BAN_MEMBER:
          return `channel_ban_member_${!!banned}`;
        case MessageType.WITHDRAW_BY_GROUP_OWNER:
          return `withdraw_by_group_owner`;
        case MessageType.WITHDRAW_BY_SENDER:
          return `withdraw_by_sender`;
        default:
          return `channel_setting_changed`;
      }
    })();
    return i18n.__({ phrase, locale }, { nickname: operator.nickname });
  };

  private async getSystemMsgChannel(userId: number): Promise<any> | never {
    try {
      const [
        { content: last_msg, updated_at, created_at: last_msg_at } = {
          content: null,
          created_at: null,
          updated_at: new Date(1000),
        },
        unread_msg_count = 0,
        seq_end,
      ] = await Promise.all([
        this.systemMsgRepo.findOne({
          select: ['content', 'updated_at', 'created_at'],
          where: { user_id: userId },
          order: { created_at: 'DESC' },
        }),
        this.systemMsgRepo.count({
          read: false,
          user_id: userId,
        }),
        this.systemMsgRepo.count({
          user_id: userId,
        }),
      ]);

      return {
        ...SYSTEM_CHANNEL,
        type: 's',
        owner_id: userId,
        msg_count: 0,
        last_msg,
        last_msg_at,
        unread_msg_count,
        updated_at,
        seq_end,
        seq_start: 0,
      };
    } catch (error) {
      throw error;
    }
  }

  // 根据channelId获取下一个end sequence
  async getNextSeqEnd(channelId: number): Promise<any> | never {
    const {
      raw: [{ seq_end }],
    } = await this.repo
      .createQueryBuilder()
      .update()
      .set({ seq_end: () => 'seq_end + 1' })
      .where('id = :channelId', { channelId })
      .returning(['seq_end'])
      .execute();
    return seq_end;
  }

  async getChannelDetail({
    channelId,
    userId,
    code,
  }: {
    channelId?: number;
    userId?: number;
    code?: string;
  }): Promise<any> | never {
    if (code === null && channelId === null) {
      throw new Error(Code.COMMON_PARAMS_INVALID);
    }
    const params = code ? { code } : { id: channelId };
    const channel = await this.repo.findOne(params, {
      select: [
        'id',
        'name',
        'code',
        'avatar',
        'status',
        'type',
        'member_count',
      ],
    });

    if (!channel) {
      throw new Error(Code.COMMON_TARGET_NOT_EXIST);
    }

    if (channel.status !== ChannelStatus.NORMAL) {
      const errorCode =
        channel.status === ChannelStatus.DELETED
          ? Code.CHANNEL_DELETED
          : Code.CHANNEL_BLOCKED;
      throw new Error(errorCode);
    }
    const isMember = userId ? await this.isMember(userId, channelId) : false;
    return { ...channel, is_member: isMember };
  }

  async banChannelUsers({
    operatorId,
    channelId,
    userIds = [],
    banned,
  }: {
    operatorId: number;
    channelId: number;
    userIds: number[];
    banned: boolean;
  }): Promise<any> | never {
    if (typeof banned !== 'boolean') {
      throw new Error(Code.COMMON_PARAMS_INVALID);
    }

    const channel = await this.repo.findOne(channelId, {
      select: ['owner_id', 'type'],
    });

    if (!channel) {
      throw new Error(Code.COMMON_TARGET_NOT_EXIST);
    }

    if (channel.owner_id !== operatorId || channel.type !== 'g') {
      throw new Error(Code.COMMON_NO_PERMISSION);
    }

    if (userIds.includes(operatorId)) {
      throw new Error(Code.CHANNEL_CANNOT_BAN_OWNER);
    }

    const toBeUpdateUserIds = (
      await this.joinRepo.find({
        select: ['user_id'],
        where: { channel_id: channelId, user_id: In(userIds), banned: !banned },
      })
    ).map(x => x.user_id);

    if (toBeUpdateUserIds.length === 0) return;

    await this.joinRepo.update(
      {
        channel_id: channelId,
        user_id: In(toBeUpdateUserIds),
      },
      { banned },
    );

    const [members, operator] = await Promise.all([
      this.getMembers({
        channel_id: channelId,
        user_id: In(toBeUpdateUserIds),
      }),
      this.getOperator(channelId, operatorId),
    ]);

    // 向当前channle推送消息
    await this.messageService.specialMsgSave({
      type: MessageType.CHANNEL_BAN_MEMBER,
      channelId,
      userId: operatorId,
      content: JSON.stringify({
        operator,
        banned,
        affectedUsers: members,
      }),
      nickname: operator.nickname,
      avatar: operator.avatar,
    });
  }

  async getbannedUsers(
    channelId: number,
    userId: number,
  ): Promise<any> | never {
    const isOwnerOrManager = await this.isOwnerOrManager(userId, channelId);

    if (!isOwnerOrManager) {
      throw new Error(Code.COMMON_NO_PERMISSION);
    }

    return await this.joinRepo
      .createQueryBuilder('channelsUser')
      .leftJoinAndSelect('channelsUser.user', 'user')
      .leftJoinAndSelect('channelsUser.channel', 'channel')
      .where({
        channel_id: channelId,
        deleted: false,
        banned: true,
      })
      .andWhere('user.state != :userState', { userState: UserState.DELETED })
      .select('user.id', 'user_id')
      .addSelect('user.uid', 'uid')
      .addSelect('user.gender', 'gender')
      .addSelect(
        // tslint:disable-next-line:quotemark
        "CONCAT(left(user.phone,GREATEST(0,length(user.phone)-4)),'****')",
        'phone',
      )
      .addSelect(
        // tslint:disable-next-line: quotemark
        "coalesce(NULLIF(channelsUser.remark_nickname, ''), NULLIF(user.nickname, ''), '')",
        'nickname',
      )
      .addSelect('user.avatar', 'avatar')
      .getRawMany();
  }

  async getMemberDetail({
    channelId,
    memberUserId,
    userId,
  }: {
    channelId: number;
    memberUserId: number;
    userId: number;
  }): Promise<any> | never {
    const channelMember = await this.joinRepo
      .createQueryBuilder('channelsUser')
      .leftJoinAndSelect('channelsUser.channel', 'channel')
      .leftJoinAndSelect('channelsUser.user', 'user')
      .where('channelsUser.channel_id = :channelId', { channelId })
      .andWhere('channelsUser.user_id = :userId', { userId: memberUserId })
      .andWhere('user.state = :userState', { userState: UserState.NORMAL })
      .select('channelsUser.channel_id', 'channel_id')
      // tslint:disable-next-line: quotemark
      .addSelect("NULLIF(channelsUser.remark_nickname, '')", 'remark_nickname')
      .addSelect('channel.owner_id', 'owner_id')
      // tslint:disable-next-line: quotemark
      .addSelect('channelsUser.id', 'id')
      // tslint:disable-next-line:quotemark
      .addSelect("channel.settings -> 'memberMasked'", 'member_masked')
      .addSelect('channelsUser.banned', 'banned')
      .addSelect('channelsUser.role', 'role')
      .addSelect('user.id', 'user_id')
      .addSelect('user.uid', 'uid')
      .addSelect('user.gender', 'gender')
      .addSelect('user.avatar', 'avatar')
      .addSelect('user.nickname', 'nickname')
      .getRawOne();

    if (!channelMember) {
      throw new Error(Code.COMMON_TARGET_NOT_EXIST);
    }

    if (channelMember.owner_id !== userId) {
      return pick(channelMember, [
        'id',
        'channel_id',
        'user_id',
        'uid',
        'gender',
        'avatar',
        'nickname',
        'remark_nickname',
        'member_masked',
        'banned',
        'role',
      ]);
    }

    return channelMember;
  }

  async setMembersRole({
    operatorId,
    channelId,
    userIds = [],
    role = ChannelUserRole.MEMBER,
  }: {
    operatorId: number;
    channelId: number;
    userIds: number[];
    role: ChannelUserRole;
  }): Promise<any> | never {
    if (!(await this.isOwner(operatorId, channelId))) {
      throw new Error(Code.COMMON_NO_PERMISSION);
    }
    await this.joinRepo.update(
      {
        channel_id: channelId,
        user_id: In(userIds),
      },
      { role },
    );
    // 通知 被操作成员 更新所在群列表角色
    const sids = await this.clientService.getSidByUserIds(userIds);
    await this.emitService.emitToSockets({
      socketIds: sids,
      event: 'channel:push-update',
      data: { channelId, attrs: { role } },
    });
  }
}
