import { Injectable } from '@nestjs/common';
import { Feedback, FeedbackStatus } from './feedback.entity';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../user/user.entity';
import { SystemMessageService } from '../system_message/system_message.service';
import { SystemMessageType } from '../system_message/system_message.entity';
import { Code } from '../common/error/code';
import { i18n } from '../common/utils';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_PAGE_NUM = 1;

export interface FeedbackInput {
  user_id: number;
  message: string;
  reply?: string;
  id?: number;
  photos?: string[];
}

export interface FindParams {
  pageSize: number;
  pageNum: number;
  keyword?: string;
  phone?: string;
  startAt?: string;
  endAt?: string;
  status?: FeedbackStatus;
}

@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(Feedback)
    private readonly feedbackRepository: Repository<Feedback>,
    private readonly systemMsgService: SystemMessageService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  // 创建
  async create(params: FeedbackInput): Promise<any> | never {
    const { user_id, photos, message } = params;
    const feedback = {
      user_id,
      message,
    } as Feedback;
    if (photos) {
      feedback.photos = photos;
    }
    try {
      return await this.feedbackRepository.save(feedback);
    } catch (error) {
      throw error;
    }
  }

  /**
   * 回复当前的反馈
   * [admin]
   * @param id
   * @param reply
   * @param memo
   */
  async replyFeedback(id: number, reply: string, memo: string): Promise<any> {
    try {
      const feedback = await this.feedbackRepository.findOne(id, {
        select: ['user_id', 'message'],
      });

      if (!feedback) {
        throw new Error(Code.COMMON_TARGET_NOT_EXIST);
      }
      const { locale } = await this.userRepo.findOne(feedback.user_id, {
        select: ['locale'],
      });
      const content = `${i18n.__(
        { phrase: 'feedback_reply', locale },
        { message: feedback.message },
      )}${reply}`;
      await Promise.all([
        this.feedbackRepository.update(
          { id },
          { reply, memo, reply_at: new Date(), status: FeedbackStatus.SOLVED },
        ),
        this.systemMsgService.create({
          userId: feedback.user_id,
          content,
          type: SystemMessageType.FEEDBACK_REPLY,
        }),
      ]);
    } catch (error) {
      throw error;
    }
  }

  /**
   *  获取帮助与反馈列表 keyword 可以模糊查询nickname|uid|nickname_pinyin
   * [admin]
   * @param filters
   * @param pageNum
   * @param pageSize
   */
  async getFeedbackList(params: FindParams): Promise<any> | never {
    try {
      const { keyword, phone, status, startAt, endAt } = params;
      let { pageNum = DEFAULT_PAGE_NUM, pageSize = DEFAULT_PAGE_SIZE } = params;
      pageNum = Math.max(pageNum, DEFAULT_PAGE_NUM);
      pageSize = Math.min(pageSize, MAX_PAGE_SIZE);
      const fb = this.getFeedbackPB();
      if (keyword) {
        fb.andWhere(`(user.nickname LIKE :keyword OR user.uid LIKE :keyword)`, {
          keyword: `${keyword}%`,
        });
      }
      if (phone) {
        fb.andWhere(`user.phone like :phone`, { phone: `${phone}%` });
      }
      if (startAt && endAt) {
        fb.andWhere(
          'feedback.created_at >= :startAt AND feedback.created_at <= :endAt',
          {
            startAt: new Date(startAt),
            endAt: new Date(endAt),
          },
        );
      }
      if (status) {
        fb.andWhere('feedback.status = :status', { status });
      } else {
        fb.andWhere('feedback.status != :status', {
          status: FeedbackStatus.DELETED,
        });
      }
      const totalCount = await fb.getCount();
      const data = await fb
        .orderBy('feedback.created_at', 'DESC')
        .limit(Number(pageSize))
        .offset((Number(pageNum) - 1) * Number(pageSize))
        .getRawMany();
      return { totalCount, data };
    } catch (error) {
      throw error;
    }
  }

  /**
   * 删除当前反馈
   * [admin]
   * @param id
   */
  async deleteOneById(id: number): Promise<any> | never {
    try {
      return await this.feedbackRepository.update(
        { id },
        { status: FeedbackStatus.DELETED, deleted_at: new Date() },
      );
    } catch (error) {
      throw error;
    }
  }

  private getFeedbackPB(): SelectQueryBuilder<Feedback> {
    return this.feedbackRepository
      .createQueryBuilder('feedback')
      .leftJoinAndSelect('feedback.user', 'user')
      .select('feedback.created_at', 'created_at')
      .addSelect('feedback.id', 'id')
      .addSelect('feedback.message', 'message')
      .addSelect('feedback.reply', 'reply')
      .addSelect('feedback.memo', 'memo')
      .addSelect('feedback.status', 'status')
      .addSelect('feedback.photos', 'photos')
      .addSelect('user.nickname', 'nickname')
      // .addSelect('user.phone', 'phone')
      .addSelect(
        // tslint:disable-next-line:quotemark
        "CONCAT(left(user.phone,GREATEST(0,length(user.phone)-4)),'****')",
        'phone',
      )
      .addSelect('user.uid', 'uid');
  }
}
