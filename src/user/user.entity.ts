import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BaseEntity,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Client } from '../client/client.entity';
import { Channel } from '../channel/channel.entity';
import { ChannelsUser } from '../channel/channels_user.entity';
import { Message } from '../message/message.entity';
import { FriendRequest } from '../friend_request/friend_request.entity';
import { Complaint } from '../complaint/complaint.entity';
import { Feedback } from '../feedback/feedback.entity';
import { SystemMessage } from '../system_message/system_message.entity';
import { StickerGroupsUser } from '../sticker/sticker_groups_user.entity';

export enum UserState {
  NORMAL = 'normal',
  BLOCKED = 'blocked',
  DELETED = 'deleted',
}

export enum UserConnectStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
}

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  UNKNOWN = 'unknown',
}

@Entity('users')
export class User extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToMany(type => Message, message => message.user)
  messages: Message[];

  @OneToMany(type => ChannelsUser, channelsUser => channelsUser.friend)
  friends: ChannelsUser[];

  @OneToMany(type => Client, client => client.user)
  clients: Client[];

  @OneToMany(type => Channel, channel => channel.creator)
  createdChannels: Channel[];

  @OneToMany(type => Channel, channel => channel.owner)
  ownedChannels: Channel[];

  @OneToMany(type => ChannelsUser, channelsUser => channelsUser.user)
  channelsUsers: ChannelsUser[];

  @OneToMany(type => Complaint, complaint => complaint.user)
  complaints: Complaint[];

  @OneToMany(type => FriendRequest, friendRequest => friendRequest.fromUser)
  fromFriendRequests: FriendRequest[];

  @OneToMany(type => FriendRequest, friendRequest => friendRequest.toUser)
  toFriendRequests: FriendRequest[];

  @Index({ unique: true })
  @Column({ type: 'varchar', unique: true, comment: '优聊号' })
  uid: string;

  @Column({ default: false, nullable: true, comment: '是否已修改' })
  uid_changed: boolean;

  @Column({ default: '86', comment: '手机区号' })
  phone_country_code: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', unique: true })
  phone: string;

  @Column({ nullable: true, width: 60, comment: '昵称' })
  nickname: string;

  @Column({ nullable: true, comment: '昵称拼音' })
  nickname_pinyin: string;

  @Column({ nullable: true })
  avatar: string;

  @Column({ default: 'zh-CN', comment: '语言' })
  locale: string;

  @Column({ default: 'Asia/Shanghai', comment: '时区' })
  timezone: string;

  @Column({
    type: 'enum',
    enum: UserState,
    default: UserState.NORMAL,
    comment: '账号状态, 如：正常、禁用、已删除',
  })
  state: UserState;

  @Column({ default: 0, comment: '违禁消息个数' })
  prohibited_msg_count: number;

  @Column({ default: 0, comment: '被举报次数' })
  complaint_times: number;

  @Index()
  @Column({ nullable: true })
  last_login_at: Date;

  @Column({
    type: 'jsonb',
    comment: '推送配置',
    nullable: true,
    default: '{"push": true}',
  })
  notify_setting: { push: boolean };

  @Column({
    type: 'enum',
    enum: Gender,
    default: Gender.MALE,
  })
  gender: Gender;

  @Column('date', { nullable: true })
  birthdate: Date;

  @Column({ default: true, comment: '加我为朋友时需要验证' })
  contact_verify_required: boolean;

  @Column({ select: false, nullable: true })
  deleted_at: Date;

  @Index()
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(type => Feedback, feedback => feedback.user)
  feedbacks: Feedback[];

  @OneToMany(type => SystemMessage, systemMessage => systemMessage.user)
  systemMessages: SystemMessage[];

  @OneToMany(
    type => StickerGroupsUser,
    sickerGroupsUser => sickerGroupsUser.user,
  )
  sickerGroupsUsers: StickerGroupsUser[];
}
