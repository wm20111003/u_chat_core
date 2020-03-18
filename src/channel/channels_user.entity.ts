import {
  Entity,
  BaseEntity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../user/user.entity';
import { Channel } from './channel.entity';

export enum ChannelUserRole {
  OWNER = 'owner',
  MANAGER = 'manager',
  MEMBER = 'member',
}
@Entity('channels_users')
@Index(['user_id', 'friend_id'], {
  unique: true,
  where: 'friend_id IS NOT NULL',
})
@Index(['user_id', 'channel_id'], {
  unique: true,
})
export class ChannelsUser extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @ManyToOne(
    type => User,
    user => user.channelsUsers,
    { nullable: false },
  )
  @JoinColumn({ name: 'user_id' })
  user: User;

  // FIXME: find a way to remove this ugly dirty shit!
  @Column()
  user_id: number;

  @Index()
  @ManyToOne(
    type => Channel,
    channel => channel.channelsUsers,
    {
      nullable: false,
    },
  )
  @JoinColumn({ name: 'channel_id' })
  channel: Channel;

  // FIXME: find a way to remove this ugly dirty shit!
  @Column()
  channel_id: number;

  @Index()
  @ManyToOne(
    type => User,
    user => user.friends,
  )
  @JoinColumn({ name: 'friend_id' })
  friend: User;

  // FIXME: find a way to remove this ugly dirty shit!
  @Column({ nullable: true })
  friend_id: number;

  @Column({ nullable: true, comment: '用户在群里显示的名称' })
  remark_nickname: string;

  @Column({ nullable: true, comment: '好友备注' })
  memo_alias: string;

  @Column({ nullable: true, comment: '好友备注拼音' })
  memo_alias_pinyin: string;

  @Column({ nullable: true, comment: '好友手机号' })
  memo_phone: string;

  @Column({ default: 0, comment: '消息数' })
  msg_count: number;

  @Column({ default: 0, comment: '未读消息数' })
  unread_msg_count: number;

  @Column({ default: 0, comment: '被@次数' })
  mention_count: number;

  @Column({ nullable: true, default: new Date(), precision: 3 })
  last_viewed_at: Date;

  @Column({ default: false, comment: '消息免打扰' })
  muted: boolean;

  @Column({ default: false, comment: '是否被加入了黑名单' })
  blacklisted: boolean;

  @Column({ nullable: true, default: false })
  deleted: boolean;

  @Column({ nullable: true, default: false })
  opened: boolean;

  @Column({ nullable: true })
  deleted_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @Index()
  @UpdateDateColumn({ precision: 3 })
  updated_at: Date;

  @Column({ nullable: true, comment: '最后一条消息' })
  last_msg: string;

  @Column({ nullable: true, comment: '最后一条消息发送时间' })
  last_msg_at: Date;

  @Column({
    nullable: true,
    default: 0,
    comment: '记录当前用户channel的消息开始sequence',
  })
  seq_start: number;

  @Column({
    nullable: true,
    default: false,
    comment: '标识当前channel成员是否被禁言',
  })
  banned: boolean;

  @Column({
    type: 'enum',
    enum: ChannelUserRole,
    comment: '成员角色',
    default: ChannelUserRole.MEMBER,
  })
  role: ChannelUserRole;
}
