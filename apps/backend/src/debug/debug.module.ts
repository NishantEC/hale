import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PipelineModule } from '../pipeline/pipeline.module.js';
import { RawSensorRecord } from '../pipeline/entities/raw-sensor-record.entity.js';
import { SleepDetection } from '../sleep/entities/sleep-detection.entity.js';
import { SleepStage } from '../sleep/entities/sleep-stage.entity.js';
import { NightFeature } from '../sleep/entities/night-feature.entity.js';
import { DailyScore } from '../wellness/entities/daily-score.entity.js';
import { DailyMetric } from '../wellness/entities/daily-metric.entity.js';
import { SleepPlan } from '../plans/sleep-plan.entity.js';
import { BaselineProfile } from '../plans/baseline-profile.entity.js';
import { SignalSample } from '../wellness/entities/signal-sample.entity.js';
import { DeviceEvent } from '../telemetry/entities/device-event.entity.js';
import { RealtimeSample } from '../telemetry/entities/realtime-sample.entity.js';
import { ConsoleLog } from '../telemetry/entities/console-log.entity.js';
import { PipelineState } from '../pipeline/entities/pipeline-state.entity.js';
import { ViewsModule } from '../views/views.module.js';
import { DebugController } from './debug.controller.js';
import { DebugService } from './debug.service.js';

@Module({
  imports: [
    PipelineModule,
    ViewsModule,
    TypeOrmModule.forFeature([
      RawSensorRecord,
      SleepDetection,
      SleepStage,
      NightFeature,
      DailyScore,
      DailyMetric,
      SleepPlan,
      BaselineProfile,
      SignalSample,
      DeviceEvent,
      RealtimeSample,
      ConsoleLog,
      PipelineState,
    ]),
  ],
  controllers: [DebugController],
  providers: [DebugService],
})
export class DebugModule {}
