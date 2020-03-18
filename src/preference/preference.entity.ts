import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BaseEntity,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum PreferenceType {
  BOOLEAN = 'boolean',
  STRING = 'string',
  NUMBER = 'number',
  CODE = 'code',
}
@Entity('preferences')
export class Preference extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ unique: true })
  name: string;

  @Column()
  value: string;

  @Column({
    type: 'enum',
    enum: PreferenceType,
    comment: '类型',
    default: PreferenceType.STRING,
  })
  type: PreferenceType;

  @CreateDateColumn({ precision: 3 })
  created_at: Date;

  @UpdateDateColumn({ precision: 3 })
  updated_at: Date;
}
