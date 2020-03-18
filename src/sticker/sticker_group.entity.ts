import {
  BaseEntity,
  PrimaryGeneratedColumn,
  Entity,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { StickerGroupsUser } from './sticker_groups_user.entity';
import { Sticker } from './sticker.entity';

export enum StickerGroupType {
  PERSONAL = 'personal',
}

@Entity('sticker_groups')
export class StickerGroup extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    nullable: true,
    comment: '表情组名称',
  })
  name: string;

  @Index()
  @Column({
    comment: '表情组拥有者',
  })
  owner_id: number;

  @Column({
    type: 'enum',
    enum: StickerGroupType,
    default: StickerGroupType.PERSONAL,
  })
  type: StickerGroupType;

  @OneToMany(
    type => StickerGroupsUser,
    stickerGroupsUser => stickerGroupsUser.stickerGroup,
    { nullable: false, cascade: true },
  )
  sickerGroupsUsers: StickerGroupsUser[];

  @OneToMany(type => Sticker, sticker => sticker.stickerGroup)
  stickers: Sticker;

  @Column({
    default: false,
    comment: '数据状态，是否被删除',
  })
  deleted: boolean;

  @CreateDateColumn({ precision: 3 })
  created_at: Date;

  @UpdateDateColumn({ precision: 3 })
  updated_at: Date;
}
