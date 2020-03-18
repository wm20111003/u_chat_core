import { Injectable, CACHE_MANAGER, Inject, forwardRef } from '@nestjs/common';
import { Repository, In } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { pick } from 'lodash';
import { Redis } from 'ioredis';
import { Client, ClientPlatform } from './client.entity';
import { ExtendedSocket } from '../events/events.interfaces';
import { Code } from '../common/error/code';
import { EmitService } from '../common/emitter/emit.service';
import { ChannelService } from '../channel/channel.service';
import { AuthKickedReason } from '../user/user.service';
import { i18n } from '../common/utils';

@Injectable()
export class ClientService {
  private readonly redis: Redis;

  constructor(
    @InjectRepository(Client)
    private readonly repo: Repository<Client>,
    @Inject(CACHE_MANAGER)
    private readonly cache: any,
    private readonly emitService: EmitService,
    @Inject(forwardRef(() => ChannelService))
    private readonly channelService: ChannelService,
  ) {
    this.redis = cache.store.getClient();
  }

  async markLogin(
    socket: ExtendedSocket,
    user: any,
    viaResume?: boolean,
  ): Promise<any> | never {
    try {
      const platform = this.getClientPlatform(socket);
      const filter: any = {
        platform,
        user_id: user.id,
      };
      const { id: sid, connected, handshake } = socket;
      const preEntity = await this.repo.findOne(filter);
      // 互踢
      if (
        preEntity &&
        preEntity.connected &&
        preEntity.sid !== sid &&
        !viaResume
      ) {
        Promise.all([
          this.emitService.emitToSockets({
            event: 'auth:push-kicked',
            socketIds: [preEntity.sid],
            data: {
              message: 'login conflict',
              reason: AuthKickedReason.LOGIN_CONFLICT,
            },
          }),
          this.emitService.leaveAllRooms({ socketId: preEntity.sid }),
        ]);
      }
      i18n.setLocale(user.locale);
      const clientEntity: any =
        preEntity ||
        this.repo.create({
          ...filter,
          ip: handshake.address,
          ua: handshake.headers['user-agent'],
        });
      clientEntity.sid = sid;
      clientEntity.connected = connected;
      clientEntity.last_connected_at = new Date();
      await clientEntity.save();
      socket.user = pick(user, ['id', 'uid', 'state', 'avatar', 'nickname']);
      socket.clientInfo = pick(clientEntity, ['id', 'platform']);
      return clientEntity;
    } catch (error) {
      throw error;
    }
  }

  async getSidByUserIds(userIds: number[]): Promise<any[]> | never {
    try {
      const sockets = await this.repo.find({
        select: ['sid'],
        where: {
          user_id: In(userIds),
          connected: true,
        },
        order: {
          last_connected_at: 'DESC',
        },
      });
      return sockets.map(x => x.sid);
    } catch (error) {
      throw error;
    }
  }

  async markLogout(socket: ExtendedSocket): Promise<void> {
    try {
      if (socket.user) {
        const platform = this.getClientPlatform(socket);
        await Promise.all([
          this.channelService.markClosed(socket.user.id),
          this.repo.update(
            {
              platform,
              user_id: socket.user.id,
              sid: socket.id,
            },
            {
              connected: false,
              disconnected_at: new Date(),
            },
          ),
        ]);
        socket.user = null;
        socket.clientInfo = null;
      }
    } catch (error) {
      throw error;
    }
  }

  private getClientPlatform(socket: ExtendedSocket): string {
    const { platform } = socket.handshake.query;
    if (!Object.values(ClientPlatform).includes(platform)) {
      throw new Error(Code.COMMON_PARAMS_MISSING);
    }
    return platform;
  }
}
