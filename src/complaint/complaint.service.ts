import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Complaint, ComplaintType, ComplaintStatus } from './complaint.entity';
import { User } from '../user/user.entity';
import { Channel } from '../channel/channel.entity';
import { SystemMessageService } from '../system_message/system_message.service';
import { SystemMessageType } from '../system_message/system_message.entity';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Code } from '../common/error/code';
import { i18n } from '../common/utils';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_NUM = 1;
const DEFAULT_PAGE_SIZE = 20;

interface CreateParams {
  userId: number;
  complaintableType: ComplaintType;
  complaintableId: number;
  photos?: string[];
  message: string;
}

export interface ReplyParams {
  id: number;
  reply: string;
  memo: string;
}

export interface FindUserComplaintParams {
  userId: number;
  pageNum: number;
  pageSize: number;
  date?: string;
}

export interface FindComplaintParams {
  pageSize: number;
  pageNum: number;
  keyword?: string;
  phone?: string;
  startAt?: string;
  endAt?: string;
  status?: ComplaintStatus;
  type?: ComplaintType;
}

@Injectable()
export class ComplaintService {
  constructor(
    @InjectRepository(Complaint)
    private readonly complaintRepo: Repository<Complaint>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Channel)
    private readonly channelRepo: Repository<Channel>,
    private readonly systemMsgService: SystemMessageService,
  ) {}

  async create(params: CreateParams): Promise<any> {
    const {
      message,
      userId: user_id,
      complaintableId: complaintable_id,
      complaintableType: complaintable_type,
    } = params;
    try {
      const repo: any =
        complaintable_type === ComplaintType.USER
          ? this.userRepo
          : this.channelRepo;
      const target = await (repo as any).findOne({
        id: complaintable_id,
      });
      if (!target) {
        throw new Error(Code.COMMON_TARGET_NOT_EXIST);
      }
      const complaint = {
        user_id,
        message,
        complaintable_id,
        complaintable_type,
      } as Complaint;
      if (params.photos) {
        complaint.photos = params.photos;
      }

      // 保存 同时 更新举报次数
      target.complaint_times += 1;
      return Promise.all([
        repo.save(target),
        this.complaintRepo.save(complaint),
      ]);
    } catch (error) {
      throw error;
    }
  }

  /**
   * 投诉回复
   * [admin]
   * @param io
   * @param params
   */
  async reply(params: ReplyParams): Promise<any> {
    const { id, reply, memo } = params;
    try {
      const complaint = await this.complaintRepo.findOne(id);
      if (!complaint) {
        throw new Error(Code.COMMON_TARGET_NOT_EXIST);
      }
      const repo =
        complaint.complaintable_type === ComplaintType.USER
          ? this.userRepo
          : this.channelRepo;

      const [{ locale }, complaintTarget] = await Promise.all([
        this.userRepo.findOne(complaint.user_id, {
          select: ['locale'],
        }),
        (repo as any).findOne(complaint.complaintable_id),
      ]);
      if (!complaintTarget) {
        throw new Error(Code.COMMON_TARGET_NOT_EXIST);
      }
      const target =
        complaint.complaintable_type === ComplaintType.USER
          ? i18n.__(
              { phrase: 'user_name', locale },
              { name: complaintTarget.nickname },
            )
          : i18n.__(
              { phrase: 'group_name', locale },
              { name: complaintTarget.name },
            );
      const content = `${i18n.__(
        { phrase: 'complaint_reply', locale },
        { target, message: complaint.message },
      )}${reply}`;

      await Promise.all([
        this.complaintRepo.update(id, {
          reply,
          memo,
          reply_at: new Date(),
          status: ComplaintStatus.SOLVED,
        }),
        this.systemMsgService.create({
          userId: complaint.user_id,
          content,
          type: SystemMessageType.COMPLAINT_REPLY,
        }),
      ]);
    } catch (error) {
      throw error;
    }
  }

  /**
   * 查询投诉列表
   * [admin]
   * @param params
   */
  async getComplaintList(params: FindComplaintParams): Promise<any> | never {
    try {
      const { keyword, phone, status, startAt, endAt, type } = params;
      let { pageNum = DEFAULT_PAGE_NUM, pageSize = DEFAULT_PAGE_SIZE } = params;
      pageNum = Math.max(pageNum, DEFAULT_PAGE_NUM);
      pageSize = Math.min(pageSize, MAX_PAGE_SIZE);
      const qb = this.getComplaintPB();
      if (keyword) {
        qb.andWhere(`(user.nickname LIKE :keyword OR user.uid LIKE :keyword)`, {
          keyword: `${keyword}%`,
        });
      }
      if (phone) {
        qb.andWhere(`user.phone like :phone`, { phone: `${phone}%` });
      }
      if (startAt && endAt) {
        qb.andWhere(
          'complaints.created_at >= :startAt AND complaints.created_at <= :endAt',
          {
            startAt: new Date(startAt),
            endAt: new Date(endAt),
          },
        );
      }
      if (status) {
        qb.andWhere('complaints.status = :status', { status });
      } else {
        qb.andWhere('complaints.status != :status', {
          status: ComplaintStatus.DELETED,
        });
      }
      if (type) {
        qb.andWhere('complaintable_type = :type', { type });
      }
      const totalCount = await qb.getCount();
      const data = await qb
        .orderBy('complaints.created_at', 'DESC')
        .limit(Number(pageSize))
        .offset((Number(pageNum) - 1) * Number(pageSize))
        .getRawMany();
      return { totalCount, data };
    } catch (error) {
      throw error;
    }
  }

  /**
   * 删除单条投诉信息
   * [admin]
   * @param id
   */
  async deleteOneById(id: number): Promise<any> | never {
    if (!id) {
      throw new Error(Code.COMMON_PARAMS_MISSING);
    }
    try {
      return await this.complaintRepo.update(
        { id },
        { status: ComplaintStatus.DELETED, deleted_at: new Date() },
      );
    } catch (error) {
      throw error;
    }
  }

  private getComplaintPB(): SelectQueryBuilder<Complaint> {
    return (
      this.complaintRepo
        .createQueryBuilder('complaints')
        .leftJoinAndSelect('complaints.user', 'user')
        .leftJoinAndSelect(
          'users',
          'u',
          `complaints.complaintable_id = u.id and complaints.complaintable_type = 'user'`,
        )
        .leftJoinAndSelect(
          'channels',
          'c',
          `complaints.complaintable_id = c.id and complaints.complaintable_type = 'channel'`,
        )
        .select('complaints.created_at', 'created_at')
        .addSelect('complaints.id', 'id')
        .addSelect('complaints.message', 'message')
        .addSelect('complaints.reply', 'reply')
        .addSelect('complaints.memo', 'memo')
        .addSelect('complaints.status', 'status')
        .addSelect('complaints.photos', 'photos')
        .addSelect('complaints.complaintable_type', 'complaintable_type')
        .addSelect('user.nickname', 'nickname')
        // .addSelect('user.phone', 'phone')
        .addSelect(
          // tslint:disable-next-line:quotemark
          "CONCAT(left(user.phone,GREATEST(0,length(user.phone)-4)),'****')",
          'phone',
        )
        .addSelect('user.uid', 'uid')
        .addSelect('u.nickname', 'u_nickname')
        .addSelect('u.uid', 'user_uid')
        .addSelect('c.name', 'c_name')
    );
  }
  // [admin] 获取用户被投诉列表
  async getUserComplaintList(params: FindUserComplaintParams): Promise<any> {
    try {
      const { userId, date } = params;
      let { pageNum = DEFAULT_PAGE_NUM, pageSize = DEFAULT_PAGE_SIZE } = params;
      pageNum = Math.max(pageNum, DEFAULT_PAGE_NUM);
      pageSize = Math.min(params.pageSize, MAX_PAGE_SIZE);
      const qb = this.complaintRepo
        .createQueryBuilder('complaint')
        .leftJoinAndSelect('complaint.user', 'user')
        .select('complaint.id', 'id')
        .addSelect('user.id', 'user_id')
        .addSelect('user.nickname', 'nickname')
        // .addSelect('user.phone', 'phone')
        .addSelect(
          // tslint:disable-next-line:quotemark
          "CONCAT(left(user.phone,GREATEST(0,length(user.phone)-4)),'****')",
          'phone',
        )
        .addSelect('complaint.photos', 'photos')
        .addSelect('complaint.created_at', 'created_at')
        .where('complaint.complaintable_id = :userId', { userId })
        .andWhere('complaint.complaintable_type = :type', {
          type: ComplaintType.USER,
        });
      if (date) {
        qb.andWhere('complaint.created_at = :date', { date });
      }
      const totalCount = await qb.getCount();
      const totalPage = Math.ceil(totalCount / pageSize);
      let data = [];
      if (pageNum <= totalPage) {
        data = await qb
          .orderBy('created_at', 'DESC')
          .offset((pageNum - 1) * pageSize)
          .limit(pageSize)
          .getRawMany();
      }
      return { totalCount, data };
    } catch (error) {
      throw error;
    }
  }
}
