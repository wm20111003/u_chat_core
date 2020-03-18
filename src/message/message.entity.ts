import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BaseEntity,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { User } from '../user/user.entity';
import { Channel } from '../channel/channel.entity';

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  AUDIO = 'audio',
  JOIN_ROOM = 'join_room',
  JOIN_ROOM_INVITE = 'join_room_invite',
  JOIN_ROOM_QRCODE = 'join_room_qrcode',
  JOIN_ROOM_LINK = 'join_room_link',
  LEAVE_ROOM = 'leave_room',
  FRIEND_ACCEPT_ME = 'friend_accept_me',
  I_ACCEPT_FRIEND = 'i_accept_friend',
  FRIEND_REQUEST = 'friend_request',
  NON_FRIEND_WARNING = 'non_friend_warning',
  COMPLAINT_REPLY = 'complaint_reply',
  CHANNEL_NAME_CHANGED = 'channel_name_changed',
  CHANNEL_OWNER_INVITE = 'channel_owner_invite_only_changed',
  CHANNEL_BANNED = 'channel_banned_changed',
  CHANNEL_BAN_MEMBER = 'channel_ban_member',
  CHANNEL_MEMBER_MASKED = 'channel_member_masked_changed',
  CONTACT_CARD = 'contact_card',
  WITHDRAW_BY_GROUP_OWNER = 'withdraw_by_group_owner',
  WITHDRAW_BY_SENDER = 'withdraw_by_sender',
  SYSTEM = 'system',
  CONTAIN_AT = 'contain_at',
}

export enum PreAuditStatus {
  PROHIBITED = 'prohibited',
  SUSPECTED = 'suspected',
  NORMAL = 'normal',
  PENDING = 'pending',
}

export enum MessageStatus {
  PROHIBITED = 'prohibited',
  NORMAL = 'normal',
  DELETED = 'deleted',
  PENDING = 'pending',
  WITHDRAW = 'withdraw',
}

@Entity('messages')
export class Message extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ unique: true, comment: '前端产生的unique ID' })
  cid: string;

  @Index()
  @ManyToOne(
    type => User,
    user => user.messages,
    { nullable: false },
  )
  @JoinColumn({ name: 'user_id' })
  user: User;

  // FIXME: find a way to remove it
  @Column({ nullable: true })
  user_id: number;

  @Index()
  @ManyToOne(
    type => Channel,
    channel => channel.messages,
    { nullable: false },
  )
  @JoinColumn({ name: 'channel_id' })
  channel: Channel;

  // FIXME: find a way to remove it
  @Column()
  channel_id: number;

  @Index()
  @ManyToOne(
    type => Message,
    message => message.quotes,
  )
  @JoinColumn({ name: 'quote_id' })
  quote: Message;

  @OneToMany(
    type => Message,
    message => message.quote,
  )
  quotes: Message[];

  @Column({ nullable: true })
  file: string;

  @Index()
  @Column({ comment: 'client表主键id', nullable: true })
  client_id: number;

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({
    type: 'enum',
    enum: MessageType,
    default: MessageType.TEXT,
    comment: '类型',
  })
  type: MessageType;

  @Column({
    type: 'enum',
    enum: PreAuditStatus,
    default: PreAuditStatus.PENDING,
    comment: '预审状态',
  })
  pre_audit_status: PreAuditStatus;

  @Column({
    type: 'enum',
    enum: MessageStatus,
    default: MessageStatus.PENDING,
    comment: '最终状态',
  })
  status: MessageStatus;

  @Column({ nullable: true })
  deleted_at: Date;

  @Column({ nullable: true })
  blocked_at: Date;

  @Index()
  @CreateDateColumn({ precision: 3 })
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({
    nullable: true,
    default: 0,
    comment: '记录当前消息sequence',
  })
  seq: number;

  @Column({
    nullable: true,
    comment: '媒体消息(语音/视频)时长(单位: 秒)',
  })
  duration: number;
}
