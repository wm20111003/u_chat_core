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
import { StickerGroup } from './sticker_group.entity';

@Entity('stickers')
export class Sticker extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    comment: '表情资源路径',
  })
  file: string;

  @Column()
  group_id: number;

  @Index()
  @ManyToOne(type => StickerGroup, stickerGroup => stickerGroup.stickers, {
    nullable: false,
  })
  @JoinColumn({ name: 'group_id' })
  stickerGroup: StickerGroup;

  @Column({
    default: false,
    comment: '数据状态，是否被删除',
  })
  deleted: boolean;

  @Column({
    default: 0,
    comment: '列表中显示的位置，值越大越靠前显示',
  })
  position: number;

  @CreateDateColumn({ precision: 3 })
  created_at: Date;

  @UpdateDateColumn({ precision: 3 })
  updated_at: Date;
}
