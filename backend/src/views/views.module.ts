import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ViewsController } from './views.controller.js';
import { ViewsService } from './views.service.js';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { SleepDetection } from '../sleep/entities/sleep-detection.entity.js';
import { SleepStage } from '../sleep/entities/sleep-stage.entity.js';
import { NightFeature } from '../sleep/entities/night-feature.entity.js';
import { DailyScore } from '../wellness/entities/daily-score.entity.js';
import { DailyMetric } from '../wellness/entities/daily-metric.entity.js';
import { SignalSample } from '../wellness/entities/signal-sample.entity.js';
import { BaselineProfile } from '../plans/baseline-profile.entity.js';
import { JournalEntry } from '../journal/journal-entry.entity.js';
import { SleepPlan } from '../plans/sleep-plan.entity.js';
import { ActivityDetection } from '../activity/entities/activity-detection.entity.js';

@Module({
  imports: [
    PipelineModule,
    TypeOrmModule.forFeature([
      SleepDetection,
      SleepStage,
      NightFeature,
      DailyScore,
      DailyMetric,
      SignalSample,
      BaselineProfile,
      JournalEntry,
      SleepPlan,
      ActivityDetection,
    ]),
  ],
  controllers: [ViewsController],
  providers: [ViewsService],
  exports: [ViewsService],
})
export class ViewsModule {}
