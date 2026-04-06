import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SleepDetection } from '../sleep/entities/sleep-detection.entity.js';
import { SleepStage } from '../sleep/entities/sleep-stage.entity.js';
import { NightFeature } from '../sleep/entities/night-feature.entity.js';
import { DailyScore } from '../wellness/entities/daily-score.entity.js';
import { DailyMetric } from '../wellness/entities/daily-metric.entity.js';
import { SignalSample } from '../wellness/entities/signal-sample.entity.js';
import { JournalEntry } from '../journal/journal-entry.entity.js';
import { SleepPlan } from '../plans/sleep-plan.entity.js';
import { BaselineProfile } from '../plans/baseline-profile.entity.js';
import { PushSyncDto } from './dto/push-sync.dto.js';

@Injectable()
export class SyncService {
  constructor(
    @InjectRepository(SleepDetection)
    private sleepDetectionRepo: Repository<SleepDetection>,
    @InjectRepository(SleepStage)
    private sleepStageRepo: Repository<SleepStage>,
    @InjectRepository(NightFeature)
    private nightFeatureRepo: Repository<NightFeature>,
    @InjectRepository(DailyScore)
    private dailyScoreRepo: Repository<DailyScore>,
    @InjectRepository(DailyMetric)
    private dailyMetricRepo: Repository<DailyMetric>,
    @InjectRepository(SignalSample)
    private signalSampleRepo: Repository<SignalSample>,
    @InjectRepository(JournalEntry)
    private journalEntryRepo: Repository<JournalEntry>,
    @InjectRepository(SleepPlan)
    private sleepPlanRepo: Repository<SleepPlan>,
    @InjectRepository(BaselineProfile)
    private baselineProfileRepo: Repository<BaselineProfile>,
  ) {}

  async push(userId: string, dto: PushSyncDto) {
    const counts: Record<string, number> = {};

    if (dto.nightFeatures?.length) {
      for (const item of dto.nightFeatures) {
        await this.nightFeatureRepo.delete({ userId, nightDate: new Date(item.nightDate) });
        await this.nightFeatureRepo.save({ ...item, userId, nightDate: new Date(item.nightDate) });
      }
      counts.nightFeatures = dto.nightFeatures.length;
    }

    if (dto.sleepDetections?.length) {
      for (const item of dto.sleepDetections) {
        await this.sleepDetectionRepo.delete({ userId, nightDate: new Date(item.nightDate) });
        await this.sleepDetectionRepo.save({
          ...item,
          userId,
          nightDate: new Date(item.nightDate),
          bedtime: new Date(item.bedtime),
          wakeTime: new Date(item.wakeTime),
        });
      }
      counts.sleepDetections = dto.sleepDetections.length;
    }

    if (dto.sleepStages?.length) {
      for (const item of dto.sleepStages) {
        await this.sleepStageRepo.delete({ userId, nightDate: new Date(item.nightDate) });
        await this.sleepStageRepo.save({ ...item, userId, nightDate: new Date(item.nightDate) });
      }
      counts.sleepStages = dto.sleepStages.length;
    }

    if (dto.dailyScores?.length) {
      for (const item of dto.dailyScores) {
        await this.dailyScoreRepo.delete({ userId, dayDate: new Date(item.dayDate) });
        await this.dailyScoreRepo.save({ ...item, userId, dayDate: new Date(item.dayDate) });
      }
      counts.dailyScores = dto.dailyScores.length;
    }

    if (dto.dailyMetrics?.length) {
      for (const item of dto.dailyMetrics) {
        await this.dailyMetricRepo.delete({ userId, dayDate: new Date(item.dayDate) });
        await this.dailyMetricRepo.save({ ...item, userId, dayDate: new Date(item.dayDate) });
      }
      counts.dailyMetrics = dto.dailyMetrics.length;
    }

    if (dto.journalEntries?.length) {
      for (const item of dto.journalEntries) {
        await this.journalEntryRepo.delete({ userId, timestamp: new Date(item.timestamp) });
        await this.journalEntryRepo.save({ ...item, userId, timestamp: new Date(item.timestamp) });
      }
      counts.journalEntries = dto.journalEntries.length;
    }

    if (dto.sleepPlan) {
      await this.sleepPlanRepo.delete({ userId });
      await this.sleepPlanRepo.save({ ...dto.sleepPlan, userId });
      counts.sleepPlan = 1;
    }

    if (dto.baselineProfile) {
      await this.baselineProfileRepo.delete({ userId });
      await this.baselineProfileRepo.save({ ...dto.baselineProfile, userId });
      counts.baselineProfile = 1;
    }

    return counts;
  }

  async pull(userId: string) {
    const [
      nightFeatures,
      sleepDetections,
      sleepStages,
      dailyScores,
      dailyMetrics,
      journalEntries,
      sleepPlan,
      baselineProfile,
    ] = await Promise.all([
      this.nightFeatureRepo.find({ where: { userId }, order: { nightDate: 'ASC' } }),
      this.sleepDetectionRepo.find({ where: { userId }, order: { nightDate: 'ASC' } }),
      this.sleepStageRepo.find({ where: { userId }, order: { nightDate: 'ASC' } }),
      this.dailyScoreRepo.find({ where: { userId }, order: { dayDate: 'ASC' } }),
      this.dailyMetricRepo.find({ where: { userId }, order: { dayDate: 'ASC' } }),
      this.journalEntryRepo.find({ where: { userId }, order: { timestamp: 'ASC' } }),
      this.sleepPlanRepo.findOne({ where: { userId } }),
      this.baselineProfileRepo.findOne({ where: { userId } }),
    ]);

    return {
      nightFeatures,
      sleepDetections,
      sleepStages,
      dailyScores,
      dailyMetrics,
      journalEntries,
      sleepPlan,
      baselineProfile,
    };
  }
}
