import { pick, omitBy, isNil } from 'lodash';
import { Injectable, forwardRef, Inject } from '@nestjs/common';
import { Repository, Brackets, In, IsNull, Not } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User, UserState, Gender } from './user.entity';
import { ChannelsUser } from '../channel/channels_user.entity';
import { Code } from '../common/error/code';
import { uid } from '../common/utils';
import { ClientService } from '../client/client.service';
import { EmitService } from '../common/emitter/emit.service';
import { i18n, getPinyin } from '../common/utils';
import { Channel } from '../channel/channel.entity';
import * as dayjs from 'dayjs';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_PAGE_NUM = 1;
const UID_REG = /^[a-zA-Z0-9]([-_a-zA-Z0-9]{5,19})$/;

export interface FindParams {
  state?: string;
  keyword?: string;
  phone?: string;
  page?: number;
  pageSize: number;
  pageNum: number;
}

export interface CreateParams {
  nickname?: string;
  gender?: Gender;
  avatar?: string;
  birthdate?: string;
  phone: string;
}

export interface EditParams {
  id: number;
  nickname?: string;
  gender?: Gender;
  avatar?: string;
  birthdate?: string;
  state?: UserState;
}

export enum AuthKickedReason {
  ACCOUNT_BLOCKED = 'ACCOUNT_BLOCKED',
  ACCOUNT_DELETED = 'ACCOUNT_DELETED',
  LOGIN_CONFLICT = 'LOGIN_CONFLICT',
}

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
    @InjectRepository(ChannelsUser)
    private readonly channelsUserRepo: Repository<ChannelsUser>,
    @InjectRepository(Channel)
    private readonly channelsRepo: Repository<Channel>,
    @Inject(forwardRef(() => ClientService))
    private readonly clientService: ClientService,
    private readonly emitService: EmitService,
  ) {}

  async search(keyword: string): Promise<User[]> {
    try {
      return await this.repo
        .createQueryBuilder('user')
        .where(
          new Brackets(_qb => {
            _qb.where('phone = :keyword OR uid = :keyword', { keyword });
          }),
        )
        .select([
          'user.id',
          'user.uid',
          'user.nickname',
          'user.avatar',
          'user.gender',
          'user.contact_verify_required',
        ])
        .getMany();
    } catch (error) {
      throw error;
    }
  }

  async updateProfile(id: number, profile: any): Promise<User | void> {
    try {
      profile = omitBy(profile, isNil);
      const fields = pick(profile, [
        'avatar',
        'nickname',
        'locale',
        'timezone',
        'gender',
        'birthdate',
        'contact_verify_required',
        'uid',
      ]) as User;
      if (fields.uid) {
        // 只能修改一次
        const changed =
          (await this.repo.count({
            id,
            uid_changed: true,
          })) > 0;
        if (changed || !UID_REG.test(fields.uid)) {
          throw new Error(Code.COMMON_PARAMS_INVALID);
        }
        const isUidExisted = (await this.repo.count({ uid: fields.uid })) > 0;
        if (isUidExisted) {
          throw new Error(Code.USER_UID_EXISTED);
        }
        fields.uid_changed = true;
      }
      if (typeof profile.notifyPush === 'boolean') {
        fields.notify_setting = { push: profile.notifyPush };
      }
      if (fields.nickname) {
        fields.nickname_pinyin = getPinyin(fields.nickname);
      }
      if (Object.keys(fields).length > 0) {
        await this.repo.update(id, fields);
        if (fields.locale) {
          i18n.setLocale(fields.locale);
        }
        return await this.repo.findOne(id);
      } else {
        throw new Error(Code.COMMON_PARAMS_MISSING);
      }
    } catch (error) {
      throw error;
    }
  }

  // [admin] 获取用户列表
  async getUserList(params: FindParams): Promise<any> | never {
    const { keyword, phone, state } = params;
    let { pageNum = DEFAULT_PAGE_NUM, pageSize = DEFAULT_PAGE_SIZE } = params;
    pageNum = Math.max(pageNum, DEFAULT_PAGE_NUM);
    pageSize = Math.min(pageSize, MAX_PAGE_SIZE);
    try {
      const countQB = this.repo.createQueryBuilder('user');
      const selectQB = this.repo
        .createQueryBuilder('user')
        .select('user.id', 'id')
        .addSelect('user.uid', 'uid')
        .addSelect('user.nickname', 'nickname')
        .addSelect('user.gender', 'gender')
        .addSelect('user.avatar', 'avatar')
        .addSelect('user.birthdate', 'birthdate')
        // .addSelect('user.phone', 'phone')
        .addSelect(
          // tslint:disable-next-line:quotemark
          "CONCAT(left(user.phone,GREATEST(0,length(user.phone)-4)),'****')",
          'phone',
        )
        .addSelect('user.state', 'state')
        .addSelect('user.created_at', 'created_at')
        .addSelect('user.complaint_times', 'complaint_times')
        .addSelect('user.prohibited_msg_count', 'prohibited_msg_count');

      if (phone) {
        selectQB.where('user.phone = :phone', { phone });
        countQB.where('user.phone = :phone', { phone });
      }
      if (keyword) {
        selectQB.andWhere(
          '(user.uid LIKE :keyword OR user.nickname LIKE :keyword)',
          {
            keyword: `${keyword}%`,
          },
        );
        countQB.andWhere(
          '(user.uid LIKE :keyword OR user.nickname LIKE :keyword)',
          {
            keyword: `${keyword}%`,
          },
        );
      }
      if (state) {
        selectQB.andWhere('user.state = :state', { state });
        countQB.andWhere('user.state = :state', { state });
      }
      selectQB
        .orderBy('user.created_at', 'DESC')
        .offset((pageNum - 1) * pageSize)
        .limit(pageSize);
      const totalCount = await countQB.getCount();
      const users = await selectQB.getRawMany();

      return { totalCount, data: users };
    } catch (error) {
      throw error;
    }
  }

  // [admin] 创建新用户
  async create(params: CreateParams): Promise<any> | never {
    try {
      const count = await this.repo.count({ phone: params.phone });
      if (count > 0) {
        throw new Error(Code.COMMON_TARGET_NOT_EXIST);
      }
      const user = await this.repo.save({
        ...params,
        uid: uid(),
      });
      return { data: user };
    } catch (error) {
      throw error;
    }
  }

  // [admin] 编辑用户
  async edit(params: EditParams): Promise<any> | never {
    try {
      const { id, ...fields } = params;
      const user = await this.repo.findOne({ id });
      if (!user || user.state === 'deleted') {
        throw new Error(Code.COMMON_TARGET_NOT_EXIST);
      }
      if (fields.nickname) {
        user.nickname_pinyin = getPinyin(fields.nickname);
      }
      this.repo.merge(user, fields);
      const userInfo = await user.save();
      if (params.state && params.state === UserState.BLOCKED) {
        this.emitToUsers({
          userIds: [id],
          event: 'auth:push-kicked',
          data: {
            message: 'account was blocked',
            reason: AuthKickedReason.ACCOUNT_BLOCKED,
          },
        });
      }
      return { data: userInfo };
    } catch (error) {
      throw error;
    }
  }

  // [admin] 删除用户
  async delete(userId: number): Promise<any> | never {
    try {
      const count = await this.repo.count({ id: userId });
      if (count === 0) {
        throw new Error(Code.COMMON_TARGET_NOT_EXIST);
      }

      await this.repo.update(userId, {
        state: UserState.DELETED,
        deleted_at: new Date(),
      });

      // 找到所属的群
      const groupIds = (
        await this.channelsUserRepo.find({
          where: { user_id: userId, deleted: false, friend_id: IsNull() },
          select: ['channel_id'],
        })
      ).map(e => e.channel_id);

      // 移除群成员 同时更新群成员数量
      if (groupIds.length > 0) {
        await Promise.all([
          this.channelsUserRepo.update(
            { user_id: userId, deleted: false },
            { deleted: true, deleted_at: new Date() },
          ),
          this.channelsRepo.decrement({ id: In(groupIds) }, 'member_count', 1),
        ]);
        const channels = await this.channelsRepo.find({
          where: { id: In(groupIds) },
          select: ['id', 'member_count'],
        });

        for (const c of channels) {
          this.emitService.emitToRoom({
            room: c.id,
            event: 'channel:push-update',
            data: {
              channelId: c.id,
              attrs: { member_count: c.member_count },
            },
          });
        }
        const [socketId] = await this.clientService.getSidByUserIds([userId]);
        await this.emitService.leaveAllRooms({ socketId });
      }

      // 踢掉登录用户
      this.emitToUsers({
        userIds: [userId],
        event: 'auth:push-kicked',
        data: {
          message: 'account deleted',
          reason: AuthKickedReason.ACCOUNT_DELETED,
        },
      });
    } catch (error) {
      throw error;
    }
  }

  // [admin] 用户详情
  async getDetail(userId: number): Promise<any> | never {
    try {
      const data =
        (await this.repo
          .createQueryBuilder('user')
          .select('user.id', 'id')
          .addSelect('user.uid', 'uid')
          .addSelect('user.nickname', 'nickname')
          .addSelect('user.gender', 'gender')
          .addSelect('user.avatar', 'avatar')
          .addSelect('user.birthdate', 'birthdate')
          // .addSelect('user.phone', 'phone')
          .addSelect(
          // tslint:disable-next-line:quotemark
          "CONCAT(left(user.phone,GREATEST(0,length(user.phone)-4)),'****')",
          'phone',
        )
          .addSelect('user.state', 'state')
          .addSelect('user.created_at', 'created_at')
          .addSelect('user.complaint_times', 'complaint_times')
          .addSelect('user.prohibited_msg_count', 'prohibited_msg_count')
          .where('user.id = :userId', { userId })
          .getRawOne()) || null;
      return { data };
    } catch (error) {
      throw error;
    }
  }

  // 数据统计 注册人数//累计注册人数 //当前在线用户 //活跃用户
  async statistics({
    types,
    startAt,
    endAt,
  }: {
    types: string[];
    startAt?: string;
    endAt?: string;
  }): Promise<any> | never {
    try {
      const registeredQuery = this.repo.createQueryBuilder('user');

      if (startAt && endAt) {
        registeredQuery.where('user.created_at BETWEEN :startAt AND :endAt', {
          startAt: new Date(startAt),
          endAt: new Date(endAt),
        });
      }
      const data = {} as any;

      // 区间内 每天/每时 的注册人数列表
      if (types.includes('registeredDetails') && startAt && endAt) {
        // 间隔小时
        const intervalHours = dayjs(endAt).diff(dayjs(startAt), 'hour');

        // 间隔天数
        const intervalDays = Math.floor(intervalHours / 24);

        // 不隔天
        if (intervalDays === 0) {
          data.registeredDetails = await this.repo.manager
            .createQueryBuilder()
            .select('COALESCE("right"."userCount", 0)', 'userCount')
            .addSelect('offs.time', 'time')
            .from(
              `(SELECT DATE_TRUNC('HOUR', timestamp with time ZONE '${startAt}') + interval '1 hour' * offs as time FROM generate_series(0, ${intervalHours}, 1) as offs)`,
              'offs',
            )
            .leftJoin(
              `(${registeredQuery
                .select('COUNT(user.id)', 'userCount')
                .addSelect(`DATE_TRUNC('HOUR', user.created_at)`, 'time')
                .groupBy(`"time"`)
                .getQuery()})`,
              'right',
              '"right".time = offs.time',
            )
            .orderBy('time', 'ASC')
            .setParameters(registeredQuery.getParameters())
            .getRawMany();
        } else {
          data.registeredDetails = await this.repo.manager
            .createQueryBuilder()
            .select('COALESCE("right"."userCount", 0)', 'userCount')
            .addSelect('offs.date', 'date')
            .from(
              `(SELECT DATE_TRUNC('DAY', timestamp '${startAt}') + interval '1 day' * offs as date FROM generate_series(0, ${intervalDays}, 1) as offs)`,
              'offs',
            )
            .leftJoin(
              `(${registeredQuery
                .select('COUNT(user.id)', 'userCount')
                .addSelect(`DATE_TRUNC('DAY', user.created_at)`, 'date')
                .groupBy(`"date"`)
                .getQuery()})`,
              'right',
              '"right".date = offs.date',
            )
            .setParameters(registeredQuery.getParameters())
            .orderBy('date', 'ASC')
            .getRawMany();
        }
      }

      // 注册总人数
      if (types.includes('sumRegistered')) {
        data.sumRegistered = await this.repo.count();
      }

      // 当前在线人数
      if (types.includes('online')) {
        const loginEnd = new Date();
        const loginStart = dayjs(loginEnd)
          .add(-1, 'hour')
          .toDate();
        data.online = await this.repo
          .createQueryBuilder('user')
          .where('user.state <> :state', {
            state: UserState.DELETED,
          })
          .andWhere('user.last_login_at BETWEEN :loginStart AND :loginEnd', {
            loginStart,
            loginEnd,
          })
          .getCount();
      }

      // 区间内活跃人数
      if (types.includes('active')) {
        data.active = await this.repo
          .createQueryBuilder('user')
          .where('user.state <> :state', {
            state: UserState.DELETED,
          })
          .andWhere('user.last_login_at BETWEEN :startAt AND :endAt', {
            startAt: new Date(startAt),
            endAt: new Date(endAt),
          })
          .getCount();
      }

      if (types.includes('activeDetails')) {
        data.activeDetails = [];
      }
      return data;
    } catch (error) {
      throw error;
    }
  }

  async getActiveCount(intervalType: string): Promise<any> {
    const startAt =
      intervalType === 'hour'
        ? dayjs().add(-1, 'hour')
        : dayjs().add(-1, 'day');
    const endAt = new Date();
    const userCount = await this.repo
      .createQueryBuilder('user')
      .where('user.state <> :state', { state: UserState.DELETED })
      .andWhere('user.last_login_at BETWEEN :startAt AND :endAt', {
        startAt,
        endAt,
      })
      .getCount();

    return { userCount };
  }

  private async emitToUsers({
    userIds,
    event,
    data,
  }: {
    userIds: number[];
    event: string;
    data: any;
  }) {
    const sids = await this.clientService.getSidByUserIds(userIds);
    if (sids && sids.length > 0) {
      await this.emitService.emitToSockets({
        event,
        socketIds: sids,
        data,
      });
    }
  }
  async getNormalIds(userIds: number[]) {
    return (
      await this.repo.find({
        select: ['id'],
        where: { id: In(userIds), state: Not(UserState.DELETED) },
      })
    ).map(u => u.id);
  }
}
