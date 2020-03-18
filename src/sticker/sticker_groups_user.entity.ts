import {
  BaseEntity,
  PrimaryGeneratedColumn,
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../user/user.entity';
import { StickerGroup } from './sticker_group.entity';

@Entity('sticker_groups_users')
export class StickerGroupsUser extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Index()
  @ManyToOne(type => User, user => user.sickerGroupsUsers, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    comment: '表情组id',
  })
  group_id: number;

  @Index()
  @ManyToOne(
    type => StickerGroup,
    stickerGroup => stickerGroup.sickerGroupsUsers,
    {
      nullable: false,
    },
  )
  @JoinColumn({ name: 'group_id' })
  stickerGroup: StickerGroup;

  @CreateDateColumn({ precision: 3 })
  created_at: Date;

  @UpdateDateColumn({ precision: 3 })
  updated_at: Date;
}
