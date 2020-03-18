import { Injectable } from '@nestjs/common';
import { Preference } from './preference.entity';
import { Repository, In, MoreThan } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { PreferenceType } from './preference.entity';
import { Code } from '../common/error/code';

export interface InputParams {
  name: string;
  value: string;
  type?: PreferenceType;
}
@Injectable()
export class PreferenceService {
  constructor(
    @InjectRepository(Preference)
    private readonly repo: Repository<Preference>,
  ) {}

  async find(names: string[] = [], updatedAt?: string): Promise<any> | never {
    const filter = {} as any;
    const date = updatedAt && new Date(updatedAt);

    if (names.length > 0) {
      Object.assign(filter, { name: In(names) });
    }
    // 只对合法日期做过滤处理
    if (date && !isNaN(date.getDate())) {
      filter.updated_at = MoreThan(date);
    }
    try {
      return await this.repo.find({
        select: ['name', 'value', 'type', 'updated_at'],
        where: filter,
      });
    } catch (error) {
      throw error;
    }
  }

  // [admin] 添加或修改引用
  async save(params: InputParams[]): Promise<any> | never {
    const entities = params.map(p => this.repo.create({ ...p }));
    try {
      return await this.repo
        .createQueryBuilder()
        .insert()
        .into(Preference)
        .values(entities)
        .onConflict(`("name") DO UPDATE SET "value"  = EXCLUDED.value`)
        .execute();
    } catch (error) {
      throw error;
    }
  }
}
