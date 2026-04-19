import { Module } from '@nestjs/common';
import { SleepModule } from '../sleep/sleep.module.js';
import { WellnessModule } from '../wellness/wellness.module.js';
import { JournalModule } from '../journal/journal.module.js';
import { PlansModule } from '../plans/plans.module.js';
import { ActivityModule } from '../activity/activity.module.js';
import { SyncService } from './sync.service.js';
import { SyncController } from './sync.controller.js';
import { SessionGuard } from '../auth/auth.guard.js';

@Module({
  imports: [SleepModule, WellnessModule, JournalModule, PlansModule, ActivityModule],
  controllers: [SyncController],
  providers: [SyncService, SessionGuard],
})
export class SyncModule {}
