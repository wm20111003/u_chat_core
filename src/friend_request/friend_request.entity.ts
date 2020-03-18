import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BaseEntity,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../user/user.entity';

export enum FriendRequestStatus {
  PENDING = 'pending',
  ACCEPT = 'accept',
  REJECT = 'reject',
  DELETED = 'deleted',
}

@Entity('friend_requests')
export class FriendRequest extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @ManyToOne(type => User, user => user.fromFriendRequests, { nullable: false })
  @JoinColumn({ name: 'from_id' })
  fromUser: User;

  @Column()
  from_id: number;

  @Index()
  @ManyToOne(type => User, user => user.toFriendRequests, { nullable: false })
  @JoinColumn({ name: 'to_id' })
  toUser: User;

  @Column()
  to_id: number;

  @Column({ width: 255 })
  message: string;

  @Column({ nullable: true, comment: '预设置好友备注' })
  memo_alias: string;

  @Column({
    type: 'enum',
    enum: FriendRequestStatus,
    default: FriendRequestStatus.PENDING,
    comment: '申请状态',
  })
  status: FriendRequestStatus;

  @Column({ nullable: true })
  deleted_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @Column({ nullable: true })
  expire_at: Date;
}
