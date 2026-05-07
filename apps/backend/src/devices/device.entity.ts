import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  userId: string;

  @Column()
  deviceName: string;

  @Column({ nullable: true })
  strapSerial: string;

  @CreateDateColumn()
  pairedAt: Date;
}
