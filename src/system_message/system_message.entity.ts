import {
  BaseEntity,
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../user/user.entity';

export enum SystemMessageType {
  FEEDBACK_REPLY = 'feedback-reply', // 意见反馈已处理
  COMPLAINT_REPLY = 'complaint-reply', // 投诉已处理
  MESSAGE_BLOCKED = 'message-blocked', // 消息被封锁
  SYSTEM_NOTICE = 'system-notice', // 系统提醒
}

@Entity('system_messages')
export class SystemMessage extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: string;

  @Index()
  @ManyToOne(type => User, user => user.systemMessages, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // FIXME: find a way to remove it
  @Column()
  user_id: number;

  @Index()
  @Column({ nullable: true })
  content: string;

  @Column({ nullable: true })
  cid: string;

  @Column({
    type: 'enum',
    enum: SystemMessageType,
    comment: '消息类型',
    default: SystemMessageType.SYSTEM_NOTICE,
  })
  type: SystemMessageType;

  @Column({ default: false, comment: '已读或未读' })
  read: boolean;

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
}
