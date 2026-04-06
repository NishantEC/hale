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
    ]),
  ],
  controllers: [DebugController],
  providers: [DebugService],
})
export class DebugModule {}
