import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('user_preferences')
export class UserPreferences {
  @PrimaryColumn('varchar')
  userId: string;

  // Free-form JSON bag. Keys without typed columns are merged in via
  // PATCH semantics — the service does a server-side deep-merge.
  @Column('jsonb', { default: () => "'{}'::jsonb" })
  data: Record<string, unknown>;

  @UpdateDateColumn()
  updatedAt: Date;
}
