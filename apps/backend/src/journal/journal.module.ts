import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JournalEntry } from './journal-entry.entity.js';
import { JournalService } from './journal.service.js';
import { JournalController } from './journal.controller.js';
import { DailyScore } from '../wellness/entities/daily-score.entity.js';
import { NightFeature } from '../sleep/entities/night-feature.entity.js';
import { DailyMetric } from '../wellness/entities/daily-metric.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([JournalEntry, DailyScore, NightFeature, DailyMetric]),
  ],
  controllers: [JournalController],
  providers: [JournalService],
  exports: [TypeOrmModule, JournalService],
})
export class JournalModule {}
