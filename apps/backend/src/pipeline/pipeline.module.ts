import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PipelineController } from './pipeline.controller.js';
import { PipelineService } from './pipeline.service.js';
import { PipelineSweeperService } from './pipeline-sweeper.service.js';
import { RawSensorRecord } from './entities/raw-sensor-record.entity.js';
import { PipelineState } from './entities/pipeline-state.entity.js';
import { PipelineRun } from './entities/pipeline-run.entity.js';

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
import { HealthkitDailySummary } from '../activity/entities/healthkit-daily-summary.entity.js';
import { HealthkitWorkout } from '../activity/entities/healthkit-workout.entity.js';
import { DeviceEvent } from '../telemetry/entities/device-event.entity.js';
import { ComputeEngineModule } from './compute-engine.module.js';

@Module({
  imports: [
    ComputeEngineModule,
    TypeOrmModule.forFeature([
      RawSensorRecord,
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
      HealthkitDailySummary,
      HealthkitWorkout,
      PipelineState,
      PipelineRun,
      DeviceEvent,
    ]),
  ],
  controllers: [PipelineController],
  providers: [PipelineService, PipelineSweeperService],
  exports: [PipelineService],
})
export class PipelineModule {}
