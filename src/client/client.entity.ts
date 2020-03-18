import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BaseEntity,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../user/user.entity';
import { Message } from '../message/message.entity';

export enum ClientPlatform {
  PC = 'pc',
  APP = 'app',
}

@Entity('clients')
export class Client extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ comment: 'socket.id' })
  sid: string;

  @Index()
  @ManyToOne(type => User, user => user.clients)
  @JoinColumn({ name: 'user_id' })
  user: User;

  // TODO: Find a way to remove below
  @Column({ nullable: true })
  user_id: number;

  @Column()
  ip: string;

  @Column({ nullable: true })
  os: string;

  @Column({ nullable: true })
  ua: string;

  @Column({
    type: 'enum',
    enum: ClientPlatform,
    default: ClientPlatform.PC,
  })
  platform: string;

  @Column({ nullable: true })
  carrier: string;

  @Column({ nullable: true })
  model: string;

  @CreateDateColumn()
  first_connected_at: Date;

  @Column()
  connected: boolean;

  @Index()
  @Column()
  last_connected_at: Date;

  @Column({ nullable: true })
  disconnected_at: Date;
}
