import { Sticker } from './sticker.entity';
import { Repository, In, MoreThan } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { Code } from '../common/error/code';
import { groupBy } from 'lodash';
import { StickerGroup, StickerGroupType } from './sticker_group.entity';
import { StickerGroupsUser } from './sticker_groups_user.entity';

// 用户自定义表情数量限制
const GROUP_SIZE_LIMIT = 200;
// 分页默认值
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_NUM = 1;
const DEFAULT_PAGE_SIZE = 50;

interface GetListParams {
  userId: number;
  pageNum: number;
  pageSize?: number;
  lastUpdatedAt?: string;
}

@Injectable()
export class StickerService {
  constructor(
    @InjectRepository(Sticker)
    private readonly repo: Repository<Sticker>,
    @InjectRepository(StickerGroup)
    private readonly stickerGroupRepo: Repository<StickerGroup>,
    @InjectRepository(StickerGroupsUser)
    private readonly stickerGroupsUserRepo: Repository<StickerGroupsUser>,
  ) {}

  /**
   * 保存自定义表情
   */
  async save(userId: number, file: string): Promise<any> | never {
    // 获取自定义表情组
    const group = await this.getPersonalStickerGroup(userId);
    const count = await this.repo.count({
      group_id: group.id,
      deleted: false,
    });
    if (count >= GROUP_SIZE_LIMIT) {
      throw new Error(Code.STICKER_LIMIT_EXCEEDED);
    }
    return await this.repo
      .create({
        group_id: group.id,
        file,
      })
      .save();
  }

  /**
   * 获取自定义表情列表
   */
  async getList(params: GetListParams): Promise<any> | never {
    const { userId, lastUpdatedAt } = params;
    let { pageNum, pageSize = DEFAULT_PAGE_SIZE } = params;
    const createdAt = lastUpdatedAt && new Date(lastUpdatedAt);
    // 获取最终分页数据
    pageNum = Math.max(pageNum, DEFAULT_PAGE_NUM);
    pageSize = Math.min(pageSize, MAX_PAGE_SIZE);
    // 返回的结果集
    const collection = {
      data: {
        deleted: [],
        normal: [],
      },
      // 是否有下一页
      hasMore: false,
    };
    // 获取自定义表情组
    const stickerGroup = await this.getPersonalStickerGroup(userId);
    if (!stickerGroup) {
      return collection;
    }
    const whereCase = { group_id: stickerGroup.id } as any;
    // 如果传入日期参数，则根据该参数获取新增和删除的数据；
    // 如果未传只获取新增数据。
    if (createdAt && !isNaN(createdAt.getDate())) {
      whereCase.updated_at = MoreThan(createdAt);
    } else {
      whereCase.deleted = false;
    }
    const data = await this.repo.find({
      select: ['id', 'file', 'position', 'deleted', 'created_at', 'updated_at'],
      where: whereCase,
      order: { updated_at: 'DESC' },
      skip: (pageNum - 1) * pageSize,
      take: pageSize,
    });
    // 按照status分组
    const normalKey = 'normal';
    const deletedKey = 'deleted';
    collection.data = data.reduce(
      (result, currentValue) => {
        if (currentValue.deleted === true) {
          result[deletedKey].push(currentValue.id);
        } else {
          result[normalKey].push(currentValue);
        }
        return result;
      },
      { normal: [], deleted: [] },
    ) as any;
    // 判断是否有下一页
    collection.hasMore = data.length === pageSize;
    return collection;
  }

  /**
   * 批量删除自定义表情
   */
  async batchDelete(
    userId: number,
    stickerIds: number[],
  ): Promise<any> | never {
    if (stickerIds instanceof Array && stickerIds.length === 0) {
      return;
    }
    // 获取自定义表情组
    const group = await this.stickerGroupsUserRepo
      .createQueryBuilder('usGroup')
      .leftJoinAndSelect('usGroup.stickerGroup', 'stickerGroup')
      .where('usGroup.user_id = :userId', {
        userId,
      })
      .andWhere('stickerGroup.type = :type', {
        type: StickerGroupType.PERSONAL,
      })
      .getOne();
    if (!group) {
      throw new Error(Code.COMMON_TARGET_NOT_EXIST);
    }
    // 软删除用户自定义表情
    await this.repo.update(
      {
        group_id: group.id,
        id: In(stickerIds),
        deleted: false,
      },
      { deleted: true },
    );
  }

  /**
   * 获取用户自定义表情组
   * @param userId 用户id
   */
  private async getPersonalStickerGroup(userId: number) {
    const group = await this.stickerGroupsUserRepo
      .createQueryBuilder('sGroupUser')
      .leftJoinAndSelect('sGroupUser.stickerGroup', 'stickerGroup')
      .select('stickerGroup.id', 'id')
      .where('sGroupUser.user_id = :userId', { userId })
      .andWhere('stickerGroup.type = :type', {
        type: StickerGroupType.PERSONAL,
      })
      .getRawOne();
    if (group) return group;
    // 创建自定义表情组
    const userStickerGroup = this.stickerGroupsUserRepo.create({
      user_id: userId,
    });
    const stickerGroup = this.stickerGroupRepo.create({
      owner_id: userId,
    });
    stickerGroup.sickerGroupsUsers = [userStickerGroup];
    return await stickerGroup.save();
  }
}
