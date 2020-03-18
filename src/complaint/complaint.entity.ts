import {
  Entity,
  BaseEntity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../user/user.entity';

export enum ComplaintType {
  USER = 'user',
  CHANNEL = 'channel',
}

export enum ComplaintStatus {
  PENDING = 'pending', // 待处理
  PROCESSING = 'processing', // 处理中
  SOLVED = 'solved', // 已处理
  DELETED = 'deleted', // 已删除
}

@Entity('complaints')
@Index(['complaintable_type', 'complaintable_id'])
export class Complaint extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @ManyToOne(type => User, user => user.complaints, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // FIXME: find a way to remove this ugly dirty shit!
  @Column()
  user_id: number;

  @Column({
    type: 'enum',
    enum: ComplaintType,
    comment: '举报类型',
    default: ComplaintType.USER,
  })
  complaintable_type: ComplaintType;

  @Column({ comment: '被投诉的群/用户Id' })
  complaintable_id: number;

  @Column('text', { array: true, nullable: true, comment: '举报的用户截图' })
  photos: string[];

  @Column({ comment: '举报信息' })
  message: string;

  @Column({ nullable: true, comment: '运营人员在后台的回复信息' })
  reply: string;

  @Column({ nullable: true, comment: '运营人员的备注' })
  memo: string;

  @Index()
  @CreateDateColumn()
  created_at: Date;

  @Column({ nullable: true })
  reply_at: Date;

  @Column({
    type: 'enum',
    enum: ComplaintStatus,
    comment: '举报状态',
    default: ComplaintStatus.PENDING,
  })
  status: ComplaintStatus;

  @Column({ nullable: true })
  deleted_at: Date;
}
