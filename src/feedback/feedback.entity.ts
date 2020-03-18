import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BaseEntity,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../user/user.entity';

export enum FeedbackStatus {
  PENDING = 'pending', // 待处理
  PROCESSING = 'processing', // 处理中
  SOLVED = 'solved', // 已处理
  DELETED = 'deleted', // 已删除
}

@Entity('feedback')
export class Feedback extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(type => User, user => user.feedbacks)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  user_id: number;

  @Column('text', { array: true, nullable: true })
  photos: string[];

  @Column({ nullable: true })
  message: string;

  @Column({ nullable: true })
  reply: string;

  @Column({ nullable: true })
  reply_at: Date;

  @Column({ nullable: true })
  memo: string;

  @Column({
    type: 'enum',
    enum: FeedbackStatus,
    default: FeedbackStatus.PENDING,
    comment: '处理状态',
  })
  status: FeedbackStatus;

  @Index()
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ nullable: true })
  deleted_at: Date;
}
