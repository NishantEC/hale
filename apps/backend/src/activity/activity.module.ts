import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityDetection } from './entities/activity-detection.entity.js';
import { HealthkitDailySummary } from './entities/healthkit-daily-summary.entity.js';
import { HealthkitWorkout } from './entities/healthkit-workout.entity.js';
import { BarometerSample } from './entities/barometer-sample.entity.js';
import { MotionActivitySample } from './entities/motion-activity-sample.entity.js';
import { RawSensorRecord } from '../pipeline/entities/raw-sensor-record.entity.js';
import { BaselineProfile } from '../plans/baseline-profile.entity.js';
import { ActivityController } from './activity.controller.js';
import { ActivityService } from './activity.service.js';
import { HealthkitController } from './healthkit.controller.js';
import { HealthkitService } from './healthkit.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ActivityDetection,
      HealthkitDailySummary,
      HealthkitWorkout,
      BarometerSample,
      MotionActivitySample,
      RawSensorRecord,
      BaselineProfile,
    ]),
  ],
  controllers: [ActivityController, HealthkitController],
  providers: [ActivityService, HealthkitService],
  exports: [TypeOrmModule, ActivityService, HealthkitService],
})
export class ActivityModule {}
