import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsResponse,
} from '@nestjs/websockets';
import { UseGuards, Inject } from '@nestjs/common';
import { Server } from 'socket.io';
import { UseLimit } from '../common/decorators/rate-limiter';
import { Logger } from 'winston';

import { ClientService } from '../client/client.service';
import { UserService } from '../user/user.service';
import { ChannelService } from '../channel/channel.service';
import { MessageService } from '../message/message.service';
import {
  FriendRequestService,
  RequestInput,
} from '../friend_request/friend_request.service';
import { AuthService } from '../auth/auth.service';
import { FeedbackService } from '../feedback/feedback.service';
import { ComplaintService } from '../complaint/complaint.service';
import { SMSService, SMSType } from '../third-party/sms/sms.service';
import { OSSService, ObjectScope } from '../third-party/oss/oss.service';
import { PreferenceService } from '../preference/preference.service';
import { SystemMessageService } from '../system_message/system_message.service';
import { EmitService } from '../common/emitter/emit.service';
import { PushService } from '../common/pusher/push.service';

import { MessageType } from '../message/message.entity';
import { ClientPlatform } from '../client/client.entity';
import { ChannelType } from '../channel/channel.entity';

import { AuthGuard } from '../common/guards/auth.guard';
import { captureException } from '../common/utils';
import { SYSTEM_CHANNEL } from '../system_message/system_message.constant';
import { Code, errorFilter } from '../common/error';
import { EventResult, ExtendedSocket } from './events.interfaces';
import { StickerService } from '../sticker/sticker.service';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { ChannelUserRole } from 'src/channel/channels_user.entity';
import * as customParser from 'socket.io-msgpack-parser';

@WebSocketGateway({
  // path: '/chat',
  serveClient: false,
  parser: process.env.SOCKET_ENCRYPT === 'true' ? customParser : null,
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly clientService: ClientService,
    private readonly userService: UserService,
    private readonly channelService: ChannelService,
    private readonly messageService: MessageService,
    private readonly feedbackService: FeedbackService,
    private readonly friendRequestService: FriendRequestService,
    private readonly authService: AuthService,
    private readonly complaintService: ComplaintService,
    private readonly sms: SMSService,
    private readonly oss: OSSService,
    private readonly preferenceService: PreferenceService,
    private readonly systemMsgService: SystemMessageService,
    private readonly emitService: EmitService,
    private readonly pushService: PushService,
    @Inject('winston') private readonly logger: Logger,
    private readonly stickerService: StickerService,
  ) {}

  afterInit(): void {
    console.log('Websocket gateway initialized!');
    this.emitService.emit('socket-server-ready', this.server);
  }

  async handleConnection(socket: ExtendedSocket): Promise<any> {
    const { token, platform } = socket.handshake.query;
    if (!Object.values(ClientPlatform).includes(platform)) {
      socket.disconnect();
    }
    if (token) {
      const user = await this.authService.resume(token, platform);
      if (user) {
        await this.clientService.markLogin(socket, user, true);
        const channelIds = await this.channelService.fetchChannelIds(user.id);
        socket.join(channelIds);
      }
    }
  }

  async handleDisconnect(socket: ExtendedSocket): Promise<any> {
    this.clientService.markLogout(socket);
  }

  // 登录
  @SubscribeMessage('auth:login')
  @UseLimit({ points: 1, duration: 1 })
  async login(
    socket: ExtendedSocket,
    params: any,
  ): Promise<EventResult> | never {
    try {
      const { platform } = socket.handshake.query;
      const { countryCode, phone, captcha } = params;
      const { user, token } = await this.authService.login({
        countryCode,
        phone,
        captcha,
        platform,
      });
      if (user) {
        await this.clientService.markLogin(socket, user);
        const channelIds = await this.channelService.fetchChannelIds(user.id);
        socket.join(channelIds);

        return { status: 'success', data: [{ user, token }] };
      }
      return { status: 'failed', code: Code.AUTH_LOGIN_FAILED };
    } catch (error) {
      captureException(error);
      this.logger.error(error);
      return {
        status: 'failed',
        code: errorFilter(error) || Code.AUTH_LOGIN_FAILED,
      };
    }
  }
  // resume 登录
  @SubscribeMessage('auth:resume')
  @UseLimit({ points: 2, duration: 1 })
  async resume(
    socket: ExtendedSocket,
    { token }: { token: string },
  ): Promise<EventResult> | never {
    try {
      const { platform } = socket.handshake.query;
      const user = await this.authService.resume(token, platform);
      if (user) {
        if (!socket.user || socket.user.id !== user.id) {
          await this.clientService.markLogin(socket, user, true);
          const channelIds = await this.channelService.fetchChannelIds(user.id);
          socket.join(channelIds);
        }
        return { status: 'success', data: [{ user, token }] };
      } else {
        return { status: 'failed', code: Code.AUTH_RESUME_FAILED };
      }
    } catch (error) {
      captureException(error);
      this.logger.error(error);
      return {
        status: 'failed',
        code: errorFilter(error) || Code.AUTH_RESUME_FAILED,
      };
    }
  }
  // 登出
  @SubscribeMessage('auth:logout')
  @UseLimit({ points: 1, duration: 2 })
  async logout(socket: ExtendedSocket): Promise<EventResult> | never {
    try {
      socket.leaveAll();
      socket.join(socket.id);
      if (socket.user) {
        await this.clientService.markLogout(socket);
      }
      return { status: 'success', data: [] };
    } catch (error) {
      captureException(error);
      this.logger.error(error);
      return {
        status: 'failed',
        code: errorFilter(error) || Code.AUTH_LOGOUT_FAILED,
      };
    }
  }

  // 获取系统设置
  @SubscribeMessage('preference:get')
  @UseLimit({ points: 2, duration: 1 })
  async fetchPreference(
    _socket: ExtendedSocket,
    { names, updatedAt }: { names: string[]; updatedAt: string },
  ): Promise<EventResult> | never {
    try {
      const preferences = await this.preferenceService.find(names, updatedAt);
      return { status: 'success', data: preferences };
    } catch (error) {
      captureException(error);
      this.logger.error(error);
      return {
        status: 'failed',
        code: errorFilter(error) || Code.PREFERENCES_GET_FAILED,
      };
    }
  }

  // 用户发消息
  @UseGuards(AuthGuard)
  @SubscribeMessage('message:send')
  @UseLimit({ points: 6, duration: 1 })
  async message(
    socket: ExtendedSocket,
    params: any,
  ): Promise<EventResult> | never {
    try {
      const { cid, channelId, file, duration, type, content } = params;
      const message = await this.messageService.save(socket.user, {
        cid,
        type: type || MessageType.TEXT,
        client_id: socket.clientInfo.id,
        channelId: Number(channelId),
        userId: socket.user.id,
        content,
        file,
        duration,
      });
      Promise.all([
        // 推送到客户端
        this.server.in(String(channelId)).emit('message:push', { message }),
        // 更新channel状态
        this.channelService.updateState({ message }),
        // 内容审查
        this.messageService.scan(message),
        // 极光推送
        this.pushService.sendMsg({
          message: {
            type,
            cid,
            channelId,
            userId: socket.user.id,
            content,
            file,
            extras: { channelId },
            nickname: message.nickname,
          },
        }),
      ]).catch(error => {
        captureException(error);
        this.logger.error(error);
      });
      return { status: 'success', data: [] };
    } catch (error) {
      captureException(error);
      this.logger.error(error);
      return {
        status: 'failed',
        code: errorFilter(error) || Code.MESSAGE_SEND_FAILED,
      };
    }
  }

  // 用户撤回消息
  @UseGuards(AuthGuard)
  @SubscribeMessage('message:withdraw')
  @UseLimit({ points: 2, duration: 1 })
  async withdraw(
    socket: ExtendedSocket,
    params: any,
  ): Promise<EventResult> | never {
    try {
      const { messageId, channelId } = params;
      await this.messageService.checkAndWithdraw({
        userId: socket.user.id,
        messageId,
        channelId,
        client_id: socket.clientInfo.id,
      });
      return { status: 'success', data: [] };
    } catch (error) {
      captureException(error);
      this.logger.error(error);
      return {
        status: 'failed',
        code: errorFilter(error) || Code.MESSAGE_WITHDRAW_FAILED,
      };
    }
  }

  // 通过Ids未读消息
  @UseGuards(AuthGuard)
  @SubscribeMessage('message:getUnread')
  @UseLimit({ points: 4, duration: 1 })
  async getUnreadMessage(
    socket: ExtendedSocket,
    {
      channelId,
      seqStart,
      seqEnd,
    }: { channelId: number; seqStart: number; seqEnd: number },
  ): Promise<WsResponse | EventResult> | null | never {
    try {
      if (!channelId && channelId !== 0) {
        throw new Error(Code.COMMON_PARAMS_MISSING);
      }
      const userId = socket.user.id;
      const messages =
        channelId === SYSTEM_CHANNEL.id
          ? await this.systemMsgService.getMsgBySeq({
              userId,
              seqStart,
              seqEnd,
            })
          : await this.channelService.getUnreadMsgBySeq({
              channelId,
              userId,
              seqStart,
              seqEnd,
            });
      return { status: 'success', data: messages };
    } catch (error) {
      this.logger.error(error);
      captureException(error);
      return { status: 'failed', code: errorFilter(error) };
    }
  }

  // 搜索用户
  @UseGuards(AuthGuard)
  @SubscribeMessage('friend:request:searchUser')
  @UseLimit({ points: 2, duration: 1 })
  async searchUser(
    _socket: ExtendedSocket,
    { keyword }: { keyword: string | null },
  ): Promise<EventResult> | never {
    try {
      if (!keyword) {
        return { status: 'failed', code: Code.COMMON_PARAMS_MISSING };
      }
      const users = await this.userService.search(keyword);
      return { status: 'success', data: users };
    } catch (error) {
      captureException(error);
      this.logger.error(error);
      return {
        status: 'failed',
        code: errorFilter(error) || Code.USER_SEARCH_FAILED,
      };
    }
  }

  // 发送好友请求
  @UseGuards(AuthGuard)
  @SubscribeMessage('friend:request:send')
  @UseLimit({ points: 1, duration: 2 })
  async createFriendRequest(
    socket: ExtendedSocket,
    params: RequestInput,
  ): Promise<EventResult> | never {
    try {
      if (String(params.toId) === String(socket.user.id)) {
        return {
          status: 'failed',
          code: Code.FRIEND_CANNOT_REQUEST_YOURSELF,
        };
      }
      const { message, toId, memo_alias } = params;
      await this.friendRequestService.createRequest({
        message,
        fromId: socket.user.id,
        toId,
        memo_alias,
      });
      return { status: 'success', data: [] };
    } catch (error) {
      captureException(error);
      this.logger.error(error);
      return {
        status: 'failed',
        code: errorFilter(error) || Code.FRIEND_SEND_REQUEST_FAILED,
      };
    }
  }
  // 获取好友请求列表
  @UseGuards(AuthGuard)
  @SubscribeMessage('friend:request:getList')
  @UseLimit({ points: 2, duration: 1 })
  async getFriendRequestList(
    socket: ExtendedSocket,
  ): Promise<EventResult> | never {
    try {
      const friendRequests = await this.friendRequestService.getRequests(
        socket.user.id,
      );
      return { status: 'success', data: friendRequests };
    } catch (error) {
      captureException(error);
      this.logger.error(error);
      return {
        status: 'failed',
        code: errorFilter(error) || Code.FRIEND_REQUEST_LIST_FAILED,
      };
    }
  }
  // 接受/拒绝好友请求
  @UseGuards(AuthGuard)
  @SubscribeMessage('friend:request:reply')
  @UseLimit({ points: 2, duration: 1 })
  async setRequest(
    socket: ExtendedSocket,
    params: any,
  ): Promise<EventResult> | never {
    try {
      const { id, status } = params;
      await this.friendRequestService.reply({
        operatorId: socket.user.id,
        client_id: socket.clientInfo.id,
        id,
        status,
        nickname: socket.user.nickname,
        avatar: socket.user.avatar,
      });
      return { status: 'success', data: [] };
    } catch (error) {
      this.logger.error(error);
      captureException(error);
      return {
        status: 'failed',
        code: errorFilter(error) || Code.FRIEND_REQUEST_REPLY_FAILED,
      };
    }
  }

  // 拉黑/修改别名
  @UseGuards(AuthGuard)
  @SubscribeMessage('friend:update')
  @UseLimit({ points: 1, duration: 5 })
  async updateFriend(
    socket: ExtendedSocket,
    params: any,
  ): Promise<EventResult> | never {
    try {
      const { channelId, attrs } = params;
      await this.channelService.channelUpdate({
        operatorId: socket.user.id,
        channelId,
        attrs,
        client_id: socket.clientInfo.id,
      });
      return { status: 'success', data: [] };
    } catch (error) {
      captureException(error);
      this.logger.error(error);
      return {
        status: 'failed',
        code: errorFilter(error) || Code.FRIEND_UPDATE_FAILED,
      };
    }
  }

  // 移除好友
  @UseGuards(AuthGuard)
  @SubscribeMessage('friend:remove')
  @UseLimit({ points: 1, duration: 1 })
  async removeFriend(
    socket: ExtendedSocket,
    { channelId }: { channelId: number },
  ): Promise<EventResult> | never {
    try {
      await this.channelService.channelRemoveUser({
        operatorId: socket.user.id,
        channelId,
        userIds: [socket.user.id],
        client_id: socket.clientInfo.id,
        channelType: ChannelType.DIRECT,
      });
      return { status: 'success', data: [] };
    } catch (error) {
      captureException(error);
      this.logger.error(error);
      return {
        status: 'failed',
        code: errorFilter(error) || Code.FRIEND_REMOVE_FAILED,
      };
    }
  }

  // feedback
  @UseGuards(AuthGuard)
  @SubscribeMessage('feedback:create')
  @UseLimit({ points: 1, duration: 10 })
  async createFeedback(
    socket: ExtendedSocket,
    feedbackInput: any,
  ): Promise<EventResult> | never {
    try {
      const { message, photos } = feedbackInput;
      if (message.length < 10) {
        return {
          status: 'failed',
          code: Code.FEEDBACK_CONTENT_TOO_SHORT,
        };
      }
      const feedback = await this.feedbackService.create({
        user_id: socket.user.id,
        message,
        photos,
      });

      return { status: 'success', data: [feedback] };
    } catch (error) {
      captureException(error);
      this.logger.error(error);
      return {
        status: 'failed',
        code: errorFilter(error) || Code.FEEDBACK_CREATE_FAILED,
      };
    }
  }

  // 拉取聊天列表
  @UseGuards(AuthGuard)
  @SubscribeMessage('channel:getList')
  @UseLimit({ points: 2, duration: 1 })
  async fetchChannels(
    socket: ExtendedSocket,
    { lastUpdatedAt }: { lastUpdatedAt?: string },
  ): Promise<EventResult> | never {
    try {
      const userId = socket.user.id;
      const channels = await this.channelService.fetchForUser(
        userId,
        lastUpdatedAt,
      );
      return {
        status: 'success',
        data: channels,
      };
    } catch (error) {
      captureException(error);
      this.logger.error(error);
      return {
        status: 'failed',
        code: errorFilter(error) || Code.CHANNEL_LIST_FAILED,
      };
    }
  }

  // 建群
  @UseGuards(AuthGuard)
  @SubscribeMessage('channel:createGroup')
  @UseLimit({ points: 1, duration: 5 })
  async createGroup(
    socket: ExtendedSocket,
    { userIds }: { userIds: number[] },
  ): Promise<EventResult> | never {
    try {
      const channel = await this.channelService.createGroup(
        socket.user.id,
        userIds,
      );
      return { status: 'success', data: [channel] };
    } catch (error) {
      captureException(error);
      this.logger.error(error);
      return {
        status: 'failed',
        code: errorFilter(error) || Code.CHANNEL_CREATE_FAILED,
      };
    }
  }

  // 拉取群成员
  @UseGuards(AuthGuard)
  @SubscribeMessage('channel:getUsers')
  @UseLimit({ points: 2, duration: 1 })
  async fetchGroupUsers(
    socket: ExtendedSocket,
    {
      channelId,
      getAll,
      lastUpdatedAt,
    }: { channelId: number; getAll: boolean; lastUpdatedAt: string },
  ): Promise<EventResult> | never {
    try {
      const result = await this.channelService.fetchChannelUsers({
        operatorId: socket.user.id,
        channelId,
        getAll,
        lastUpdatedAt,
      });
      return {
        status: 'success',
        data: Array.isArray(result) ? result : [result],
      };
    } catch (error) {
      captureException(error);
      this.logger.error(error);
      return {
        status: 'failed',
        code: errorFilter(error) || Code.CHANNEL_GET_MEMBERS_FAILED,
      };
    }
  }

  // 群组添加成员, 扫码进群 需传邀请者id(inviterId)、链接进群 code、普通添加 传userIds
  @UseGuards(AuthGuard)
  @SubscribeMessage('channel:addUsers')
  @UseLimit({ points: 1, duration: 1 })
  async addUserToGroup(
    socket: ExtendedSocket,
    {
      channelId,
      userIds, // 被邀请者
      inviterId, // 邀请者
      code, // 链接加群
    }: {
      channelId?: number;
      userIds?: number[];
      inviterId?: number;
      code?: string;
    },
  ): Promise<any> | never {
    try {
      // 如果当前用户扫码，则当前用户为被邀请的人
      if (inviterId) {
        userIds = [socket.user.id];
      }
      await this.channelService.addUserToGroup({
        operatorId: inviterId || socket.user.id,
        channelId,
        userIds,
        client_id: socket.clientInfo.id,
        viaQrcode: !!inviterId,
        viaLink: !!code,
        code,
      });
      return { status: 'success', data: [] };
    } catch (error) {
      captureException(error);
      this.logger.error(error);
      return {
        status: 'failed',
        code: errorFilter(error) || Code.CHANNEL_ADD_MEMBER_FAILED,
      };
    }
  }

  // 从群组中移除成员
  @UseGuards(AuthGuard)
  @SubscribeMessage('channel:removeUsers')
  @UseLimit({ points: 1, duration: 1 })
  async removeUserFromGroup(
    socket: ExtendedSocket,
    { channelId, userIds }: { channelId: number; userIds: number[] },
  ): Promise<any> | never {
    try {
      await this.channelService.channelRemoveUser({
        operatorId: socket.user.id,
        channelId,
        userIds,
        client_id: socket.clientInfo.id,
        channelType: ChannelType.GROUP,
      });
      return { status: 'success', data: [] };
    } catch (error) {
      captureException(error);
      this.logger.error(error);
      return {
        status: 'failed',
        code: errorFilter(error) || Code.CHANNEL_REMOVE_MEMBER_FAILED,
      };
    }
  }

  // 修改channel信息
  @UseGuards(AuthGuard)
  @SubscribeMessage('channel:update')
  @UseLimit({ points: 1, duration: 1 })
  async updateChannelInfo(
    socket: ExtendedSocket,
    params: any,
  ): Promise<EventResult> | never {
    try {
      const { channelId, attrs } = params;
      await this.channelService.channelUpdate({
        operatorId: socket.user.id,
        channelId,
        attrs,
        client_id: socket.clientInfo.id,
      });
      return { status: 'success', data: [] };
    } catch (error) {
      captureException(error);
      this.logger.error(error);
      return {
        status: 'failed',
        code: errorFilter(error) || Code.CHANNEL_UPDATE_FAILED,
      };
    }
  }

  // 打开 channel
  @UseGuards(AuthGuard)
  @SubscribeMessage('channel:open')
  @UseLimit({ points: 3, duration: 1 })
  async openChannel(
    socket: ExtendedSocket,
    { channelId }: { channelId: number },
  ): Promise<WsResponse | EventResult> | null | never {
    try {
      if (!channelId && channelId !== 0) {
        throw new Error(Code.COMMON_PARAMS_MISSING);
      }
      let withdrawIds = [];
      if (channelId === SYSTEM_CHANNEL.id) {
        await this.systemMsgService.markAsRead(socket.user.id);
      } else {
        withdrawIds = await this.channelService.markAsRead(
          socket.user.id,
          channelId,
        );
      }
      return { status: 'success', data: [{ withdrawIds }] };
    } catch (error) {
      this.logger.error(error);
      captureException(error);
      return { status: 'failed', code: errorFilter(error) };
    }
  }

  // 关闭channel
  @UseGuards(AuthGuard)
  @SubscribeMessage('channel:close')
  @UseLimit({ points: 3, duration: 1 })
  async closeChannel(
    socket: ExtendedSocket,
    { channelId }: { channelId: number },
  ): Promise<WsResponse | EventResult> | null | never {
    try {
      await this.channelService.markClosed(socket.user.id, channelId);
    } catch (error) {
      this.logger.error(error);
      captureException(error);
      return { status: 'failed', code: errorFilter(error) };
    }
  }

  // 获取channel基本信息
  @UseGuards(AuthGuard)
  @SubscribeMessage('channel:getDetail')
  @UseLimit({ points: 3, duration: 1 })
  async getChannelDetail(
    socket: ExtendedSocket,
    { channelId }: { channelId: number },
  ): Promise<WsResponse | EventResult> | null | never {
    try {
      const channel = await this.channelService.getChannelDetail({
        channelId,
        userId: socket.user.id,
      });
      return { status: 'success', data: [channel] };
    } catch (error) {
      this.logger.error(error);
      captureException(error);
      return { status: 'failed', code: errorFilter(error) };
    }
  }

  // 群成员禁言
  @UseGuards(AuthGuard)
  @SubscribeMessage('channel:banUsers')
  @UseLimit({ points: 1, duration: 1 })
  async banChannelUsers(
    socket: ExtendedSocket,
    {
      channelId,
      userIds,
      banned,
    }: { channelId: number; userIds: number[]; banned: boolean },
  ): Promise<WsResponse | EventResult> | null | never {
    try {
      await this.channelService.banChannelUsers({
        operatorId: socket.user.id,
        channelId,
        userIds,
        banned,
      });
      return { status: 'success', data: [] };
    } catch (error) {
      this.logger.error(error);
      captureException(error);
      return { status: 'failed', code: errorFilter(error) };
    }
  }

  // 获取群禁言成员列表
  @UseGuards(AuthGuard)
  @SubscribeMessage('channel:getBannedUsers')
  @UseLimit({ points: 3, duration: 1 })
  async getBannedChannelUsers(
    socket: ExtendedSocket,
    { channelId }: { channelId: number },
  ): Promise<WsResponse | EventResult> | null | never {
    try {
      const channelUsers = await this.channelService.getbannedUsers(
        channelId,
        socket.user.id,
      );
      return { status: 'success', data: channelUsers };
    } catch (error) {
      this.logger.error(error);
      captureException(error);
      return { status: 'failed', code: errorFilter(error) };
    }
  }

  // 设置群成员角色
  @UseGuards(AuthGuard)
  @SubscribeMessage('channel:setMembersRole')
  @UseLimit({ points: 3, duration: 1 })
  async setMembersRole(
    socket: ExtendedSocket,
    {
      channelId,
      userIds,
      role,
    }: { channelId: number; userIds: number[]; role: ChannelUserRole },
  ): Promise<WsResponse | EventResult> | null | never {
    try {
      await this.channelService.setMembersRole({
        operatorId: socket.user.id,
        channelId,
        userIds,
        role,
      });
      return { status: 'success', data: [] };
    } catch (error) {
      this.logger.error(error);
      captureException(error);
      return { status: 'failed', code: errorFilter(error) };
    }
  }

  @UseGuards(AuthGuard)
  @SubscribeMessage('channel:getMemberDetail')
  @UseLimit({ points: 3, duration: 1 })
  async getChannelMemberDetail(
    socket: ExtendedSocket,
    { channelId, memberUserId }: { channelId: number; memberUserId: number },
  ): Promise<WsResponse | EventResult> | null | never {
    try {
      const member = await this.channelService.getMemberDetail({
        channelId,
        memberUserId,
        userId: socket.user.id,
      });
      return { status: 'success', data: [member] };
    } catch (error) {
      this.logger.error(error);
      captureException(error);
      return { status: 'failed', code: errorFilter(error) };
    }
  }

  // 更新个人信息
  @UseGuards(AuthGuard)
  @SubscribeMessage('profile:update')
  @UseLimit({ points: 1, duration: 1 })
  async registerByPhone(
    socket: ExtendedSocket,
    data: any,
  ): Promise<EventResult> | never {
    try {
      const user =
        (await this.userService.updateProfile(socket.user.id, data)) ||
        socket.user;
      socket.user = {
        ...socket.user,
        avatar: user.avatar,
        nickname: user.nickname,
      };
      return { status: 'success', data: [user] };
    } catch (error) {
      captureException(error);
      this.logger.error(error);
      return {
        status: 'failed',
        code: errorFilter(error) || Code.PROFILE_UPDATE_FAILED,
      };
    }
  }

  // 创建投诉
  @UseGuards(AuthGuard)
  @SubscribeMessage('complaint:create')
  @UseLimit({ points: 1, duration: 10 })
  async createComplaint(
    socket: ExtendedSocket,
    params: any,
  ): Promise<EventResult> | never {
    try {
      params.userId = socket.user.id;
      await this.complaintService.create(params);
      return { status: 'success', data: [] };
    } catch (error) {
      captureException(error);
      this.logger.error(error);
      return {
        status: 'failed',
        code: errorFilter(error) || Code.COMPLAINT_CREATE_FAILED,
      };
    }
  }

  // 输入开始
  @UseGuards(AuthGuard)
  @SubscribeMessage('typing:start')
  @UseLimit({ points: 10, duration: 1 })
  startTyping(
    socket: ExtendedSocket,
    { channelId }: { channelId: number },
  ): void {
    socket.to(String(channelId)).emit('typing:push-start', { channelId });
  }

  // 输入停止
  @UseGuards(AuthGuard)
  @SubscribeMessage('typing:stop')
  @UseLimit({ points: 10, duration: 1 })
  stopTyping(
    socket: ExtendedSocket,
    { channelId }: { channelId: number },
  ): void {
    socket.to(String(channelId)).emit('typing:push-stop', { channelId });
  }

  // OSS 客户端直传时，服务端签名
  @UseGuards(AuthGuard)
  @SubscribeMessage('upload:getSign')
  @UseLimit({ points: 1, duration: 1, extractParamAsPrefix: 'scope' })
  async uploadSignature(
    _socket: ExtendedSocket,
    { scope }: { scope: ObjectScope },
  ): Promise<EventResult> | never {
    try {
      const data = await this.oss.signature(scope).catch(error => {
        throw error;
      });
      return { status: 'success', data: [data] };
    } catch (error) {
      captureException(error);
      this.logger.error(error);
      return {
        status: 'failed',
        code: errorFilter(error) || Code.UPLOAD_SIGN_GET_FAILED,
      };
    }
  }

  // 获取短信验证码
  @SubscribeMessage('captcha:send')
  @UseLimit({
    points: 1,
    duration: 1, // Number(process.env.ALIYUN_SMS_INTERVAL_LIMIT),
    customErrorCode: Code.SMS_TOO_MANY_REQUEST,
  })
  async sendSMS(
    _socket: ExtendedSocket,
    params: any,
  ): Promise<EventResult> | never {
    try {
      const { countryCode, phone, type = SMSType.LOGIN } = params;
      if (phone === '18888888888') {
        return { status: 'success', data: [{ captcha: '888888' }] };
      }
      if (!/^(\+?\d{1,3}|\d{1,4})$/.test(countryCode) || !phone) {
        return { status: 'failed', code: Code.SMS_MOBILE_NUMBER_ILLEGAL };
      }
      const captcha = await this.sms.send(countryCode, phone, type);
      if (process.env.TEST_MODE === 'true') {
        return { status: 'success', data: [{ captcha }] };
      }
      return { status: 'success', data: [{}] };
    } catch (error) {
      captureException(error);
      this.logger.error(error);
      return { status: 'failed', code: errorFilter(error) };
    }
  }

  // 添加自定义表情
  @SubscribeMessage('sticker:addNew')
  async addPersonalSticker(
    socket: ExtendedSocket,
    params: any,
  ): Promise<EventResult> | never {
    try {
      const { file } = params;
      const sticker = await this.stickerService.save(socket.user.id, file);
      return { status: 'success', data: [sticker] };
    } catch (error) {
      captureException(error);
      this.logger.error(error);
      return { status: 'failed', code: errorFilter(error) };
    }
  }

  // 获取自定义表情列表，增量获取
  @SubscribeMessage('sticker:getList')
  async syncStickers(
    socket: ExtendedSocket,
    params: any,
  ): Promise<Observable<WsResponse>> {
    try {
      const { pageSize, lastUpdatedAt } = params;
      // 分页推送数据
      const ob = Observable.create(async (observer: any) => {
        const getListParams = {
          userId: socket.user.id,
          pageSize,
          pageNum: 1,
          lastUpdatedAt,
        };
        let collection = await this.stickerService.getList(getListParams);
        // 推送订阅数据
        observer.next(collection.data);
        // 获取下一页数据
        while (collection.hasMore) {
          getListParams.pageNum++;
          collection = await this.stickerService.getList(getListParams);
          const data = collection.data;
          // 没有数据不推送
          if (data.normal.length > 0 || data.deleted.length > 0) {
            observer.next(data);
          }
        }
      });
      const subscription = ob.pipe(
        map(item => {
          return { event: 'sticker:push', data: [item] };
        }),
      );
      return subscription;
    } catch (error) {
      captureException(error);
      this.logger.error(error);
    }
  }

  // 删除自定义表情
  @SubscribeMessage('sticker:batchDelete')
  async deletePersonalSticker(
    socket: ExtendedSocket,
    params: any,
  ): Promise<EventResult> | never {
    try {
      const { ids } = params;
      await this.stickerService.batchDelete(socket.user.id, ids);
      return { status: 'success', data: [] };
    } catch (error) {
      captureException(error);
      this.logger.error(error);
      return { status: 'failed', code: errorFilter(error) };
    }
  }
}
