import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BaseEntity,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  JoinColumn,
  Index,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../user/user.entity';
import { ChannelsUser } from './channels_user.entity';
import { Message } from '../message/message.entity';

export enum ChannelType {
  DIRECT = 'd',
  GROUP = 'g',
}

export enum ChannelStatus {
  NORMAL = 'normal',
  BLOCKED = 'blocked',
  DELETED = 'deleted',
}

@Entity('channels')
export class Channel extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ nullable: true, comment: '群唯一编号' })
  code: string;

  @Index()
  @Column({ nullable: true, comment: '频道名称' })
  name: string;

  @Column({ comment: '频道头像', nullable: true })
  avatar: string;

  @Column({
    type: 'enum',
    enum: ChannelType,
    comment: '频道类型',
    default: ChannelType.DIRECT,
  })
  type: ChannelType;

  @Index()
  @ManyToOne(type => User, user => user.createdChannels, { nullable: true })
  @JoinColumn({ name: 'creator_id' })
  creator: User;

  // FIXME: find a way to remove this ugly dirty shit!
  @Column({ nullable: true })
  creator_id: number;

  @Index()
  @ManyToOne(type => User, user => user.ownedChannels, { nullable: false })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  // FIXME: find a way to remove this ugly dirty shit!
  @Column()
  owner_id: number;

  @OneToMany(type => ChannelsUser, channelsUser => channelsUser.channel, {
    cascade: true,
  })
  channelsUsers: ChannelsUser[];

  @Column({ default: 0, comment: '消息总条数' })
  total_msg_count: number;

  @Column({ nullable: true, comment: '最后一条消息' })
  last_msg: string;

  @Column({ nullable: true, comment: '最后一条消息发送时间' })
  last_msg_at: Date;

  @Column({ nullable: true, comment: '群公告' })
  announcement: string;

  @Index()
  @Column({ default: 0, comment: '群成员数' })
  member_count: number;

  @Column({ default: 1000, comment: '群成员数上限' })
  member_count_limit: number;

  @Column({ default: 0, comment: '被举报次数' })
  complaint_times: number;

  @Column({
    type: 'enum',
    enum: ChannelStatus,
    default: ChannelStatus.NORMAL,
  })
  status: ChannelStatus;

  @Column({ nullable: true })
  deleted_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(type => Message, message => message.channel)
  messages: Message[];

  @Column({
    nullable: true,
    default: 0,
    comment: '记录当前channel的最后sequence',
  })
  seq_end: number;

  @Column({
    type: 'jsonb',
    comment: '群配置',
    nullable: true,
    default:
      '{"ownerInviteOnly": false, "banned": false, "memberMasked": false}',
  })
  settings: {
    ownerInviteOnly: boolean;
    banned: boolean;
    memberMasked: boolean;
  };

  @Column({ nullable: true })
  announcement_posted_at: Date;
}
