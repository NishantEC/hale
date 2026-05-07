import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyScore } from './entities/daily-score.entity.js';
import { DailyMetric } from './entities/daily-metric.entity.js';
import { SignalSample } from './entities/signal-sample.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([DailyScore, DailyMetric, SignalSample])],
  exports: [TypeOrmModule],
})
export class WellnessModule {}
