import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health.controller.js';
import { HealthAssessmentService } from './health-assessment.service.js';
import { HealthAssessment } from './entities/health-assessment.entity.js';
import { UserProfile } from './entities/user-profile.entity.js';
import { NightFeature } from '../sleep/entities/night-feature.entity.js';
import { SleepDetection } from '../sleep/entities/sleep-detection.entity.js';
import { DailyMetric } from '../wellness/entities/daily-metric.entity.js';
import { HealthkitDailySummary } from '../activity/entities/healthkit-daily-summary.entity.js';
import { BaselineProfile } from '../plans/baseline-profile.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      HealthAssessment,
      UserProfile,
      NightFeature,
      SleepDetection,
      DailyMetric,
      HealthkitDailySummary,
      BaselineProfile,
    ]),
  ],
  controllers: [HealthController],
  providers: [HealthAssessmentService],
  exports: [HealthAssessmentService],
})
export class HealthModule {}
