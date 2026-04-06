import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';

import { PipelineService } from '../pipeline/pipeline.service.js';
import { RawSensorRecord } from '../pipeline/entities/raw-sensor-record.entity.js';
import { SleepDetection } from '../sleep/entities/sleep-detection.entity.js';
import { SleepStage } from '../sleep/entities/sleep-stage.entity.js';
import { NightFeature } from '../sleep/entities/night-feature.entity.js';
import { DailyScore } from '../wellness/entities/daily-score.entity.js';
import { DailyMetric } from '../wellness/entities/daily-metric.entity.js';
import { SleepPlan } from '../plans/sleep-plan.entity.js';
import { ViewsService } from '../views/views.service.js';

type SelectionMode =
  | 'exactMatch'
  | 'fallbackToLatestCompletedNight'
  | 'noNightAvailable';

type SelectionResult<T> = {
  item: T | null;
  mode: SelectionMode;
};

@Injectable()
export class DebugService {
  private readonly enabled =
    process.env.DEBUG_INSPECTOR_ENABLED === 'true' ||
    (process.env.DEBUG_INSPECTOR_ENABLED == null && process.env.NODE_ENV !== 'production');

  constructor(
    private readonly pipelineService: PipelineService,
    private readonly viewsService: ViewsService,
    @InjectRepository(RawSensorRecord)
    private readonly rawSensorRepo: Repository<RawSensorRecord>,
    @InjectRepository(SleepDetection)
    private readonly sleepDetectionRepo: Repository<SleepDetection>,
    @InjectRepository(SleepStage)
    private readonly sleepStageRepo: Repository<SleepStage>,
    @InjectRepository(NightFeature)
    private readonly nightFeatureRepo: Repository<NightFeature>,
    @InjectRepository(DailyScore)
    private readonly dailyScoreRepo: Repository<DailyScore>,
    @InjectRepository(DailyMetric)
    private readonly dailyMetricRepo: Repository<DailyMetric>,
    @InjectRepository(SleepPlan)
    private readonly sleepPlanRepo: Repository<SleepPlan>,
  ) {}

  assertEnabled() {
    if (!this.enabled) {
      throw new NotFoundException();
    }
  }

  async getOverview(userId: string, dateInput?: string) {
    this.assertEnabled();

    const selectedDate = this.resolveSelectedDate(dateInput);
    const selectedKey = this.dayKey(selectedDate);
    const cutoff = new Date(selectedDate.getTime() - 45 * 24 * 60 * 60 * 1000);
    const { start, end } = this.localDayBounds(selectedDate);

    const [
      rawRecordCount,
      sleepDetectionCount,
      sleepStageCount,
      dailyScoreCount,
      dailyMetricCount,
      earliestRaw,
      latestRaw,
      selectedDayRawRecordCount,
      recentDetections,
      recentStages,
      recentFeatures,
      latestSleepPlan,
      homeView,
      sleepView,
    ] = await Promise.all([
      this.rawSensorRepo.count({ where: { userId } }),
      this.sleepDetectionRepo.count({ where: { userId } }),
      this.sleepStageRepo.count({ where: { userId } }),
      this.dailyScoreRepo.count({ where: { userId } }),
      this.dailyMetricRepo.count({ where: { userId } }),
      this.rawSensorRepo.findOne({ where: { userId }, order: { timestamp: 'ASC' } }),
      this.rawSensorRepo.findOne({ where: { userId }, order: { timestamp: 'DESC' } }),
      this.rawSensorRepo
        .createQueryBuilder('raw')
        .where('raw."userId" = :userId', { userId })
        .andWhere('raw.timestamp >= :start', { start })
        .andWhere('raw.timestamp < :end', { end })
        .getCount(),
      this.sleepDetectionRepo.find({
        where: { userId, nightDate: MoreThanOrEqual(cutoff) },
        order: { nightDate: 'ASC' },
      }),
      this.sleepStageRepo.find({
        where: { userId, nightDate: MoreThanOrEqual(cutoff) },
        order: { nightDate: 'ASC' },
      }),
      this.nightFeatureRepo.find({
        where: { userId, nightDate: MoreThanOrEqual(cutoff) },
        order: { nightDate: 'ASC' },
      }),
      this.sleepPlanRepo.findOne({ where: { userId } }),
      this.viewsService.getHomeView(userId, selectedKey),
      this.viewsService.getSleepView(userId, selectedKey),
    ]);

    const detectionSelection = this.selectByDayOrLatestForToday(
      recentDetections,
      'nightDate',
      selectedKey,
      selectedDate,
    );
    const stageSelection = this.selectByDayOrLatestForToday(
      recentStages,
      'nightDate',
      selectedKey,
      selectedDate,
    );
    const featureSelection = this.selectByDayOrLatestForToday(
      recentFeatures,
      'nightDate',
      selectedKey,
      selectedDate,
    );

    const selectionMode = this.pickSelectionMode(
      detectionSelection,
      stageSelection,
      featureSelection,
    );
    const selectedNightDate =
      detectionSelection.item?.nightDate ??
      stageSelection.item?.nightDate ??
      featureSelection.item?.nightDate ??
      null;
    const epochTimelineCount = Array.isArray(stageSelection.item?.epochTimeline)
      ? stageSelection.item!.epochTimeline.length
      : 0;

    return {
      selectedDate: selectedKey,
      selectedDateTitle: this.formatSelectedDateTitle(selectedDate),
      selectedDateSubtitle: this.formatSelectedDateSubtitle(selectedDate),
      selectedNightDate: selectedNightDate ? this.dayKey(selectedNightDate) : null,
      selectionMode,
      selectionReason: this.selectionReason(selectionMode),
      counts: {
        rawRecordCount,
        sleepDetectionCount,
        sleepStageCount,
        dailyScoreCount,
        dailyMetricCount,
        selectedDayRawRecordCount,
      },
      earliestRawTimestamp: earliestRaw?.timestamp?.toISOString() ?? null,
      latestRawTimestamp: latestRaw?.timestamp?.toISOString() ?? null,
      latestSyncMetadata: {
        lastRawRecordAt: latestRaw?.timestamp?.toISOString() ?? null,
        lastSleepPlanUpdateAt: latestSleepPlan?.updatedAt?.toISOString() ?? null,
        plannerConfigured: latestSleepPlan != null,
      },
      selectedEntities: {
        detectionId: detectionSelection.item?.id ?? null,
        stageId: stageSelection.item?.id ?? null,
        featureId: featureSelection.item?.id ?? null,
        epochTimelineCount,
      },
      lastPipelineRunStatus:
        dailyScoreCount > 0 ? 'storedResultsAvailable' : 'noStoredResultsYet',
      viewSummary: {
        home: {
          title: homeView.selectedDateTitle,
          headline: homeView.todayOverview.headline,
          recommendation: homeView.cards.recommendation.title,
        },
        sleep: {
          title: sleepView.selectedDateTitle,
          isEmpty: sleepView.emptyState.isEmpty,
          bedtime: sleepView.header.bedtime,
          wakeTime: sleepView.header.wakeTime,
        },
      },
    };
  }

  async getRawRecords(userId: string, dateInput?: string, limit = 200) {
    this.assertEnabled();
    const selectedDate = this.resolveSelectedDate(dateInput);
    const selectedKey = this.dayKey(selectedDate);
    const { start, end } = this.localDayBounds(selectedDate);
    const rows = await this.rawSensorRepo
      .createQueryBuilder('raw')
      .where('raw."userId" = :userId', { userId })
      .andWhere('raw.timestamp >= :start', { start })
      .andWhere('raw.timestamp < :end', { end })
      .orderBy('raw.timestamp', 'DESC')
      .limit(Math.min(Math.max(limit, 1), 500))
      .getMany();

    return {
      selectedDate: selectedKey,
      startTimestamp: start.toISOString(),
      endTimestamp: end.toISOString(),
      count: rows.length,
      rows: rows.map((row) => ({
        id: row.id,
        timestamp: row.timestamp.toISOString(),
        heartRate: row.heartRate,
        rrAverageMs: row.rrAverageMs,
        skinContact: row.skinContact,
        gravityMagnitude: row.gravityMagnitude,
        gravityX: row.gravityX,
        gravityY: row.gravityY,
        gravityZ: row.gravityZ,
        respRateRaw: row.respRateRaw,
        spo2Red: row.spo2Red,
        spo2IR: row.spo2IR,
        skinTempRaw: row.skinTempRaw,
      })),
    };
  }

  async getSleepNight(userId: string, dateInput?: string) {
    this.assertEnabled();
    const selectedDate = this.resolveSelectedDate(dateInput);
    const selectedKey = this.dayKey(selectedDate);
    const cutoff = new Date(selectedDate.getTime() - 45 * 24 * 60 * 60 * 1000);

    const [detections, stages, features] = await Promise.all([
      this.sleepDetectionRepo.find({
        where: { userId, nightDate: MoreThanOrEqual(cutoff) },
        order: { nightDate: 'ASC' },
      }),
      this.sleepStageRepo.find({
        where: { userId, nightDate: MoreThanOrEqual(cutoff) },
        order: { nightDate: 'ASC' },
      }),
      this.nightFeatureRepo.find({
        where: { userId, nightDate: MoreThanOrEqual(cutoff) },
        order: { nightDate: 'ASC' },
      }),
    ]);

    const detectionSelection = this.selectByDayOrLatestForToday(
      detections,
      'nightDate',
      selectedKey,
      selectedDate,
    );
    const stageSelection = this.selectByDayOrLatestForToday(
      stages,
      'nightDate',
      selectedKey,
      selectedDate,
    );
    const featureSelection = this.selectByDayOrLatestForToday(
      features,
      'nightDate',
      selectedKey,
      selectedDate,
    );

    const detection = detectionSelection.item;
    const stage = stageSelection.item;
    const feature = featureSelection.item;
    const selectionMode = this.pickSelectionMode(
      detectionSelection,
      stageSelection,
      featureSelection,
    );
    const epochTimeline = Array.isArray(stage?.epochTimeline) ? (stage!.epochTimeline as any[]) : [];

    return {
      selectedDate: selectedKey,
      selectedNightDate:
        detection?.nightDate?.toISOString() ??
        stage?.nightDate?.toISOString() ??
        feature?.nightDate?.toISOString() ??
        null,
      selectionMode,
      selectionReason: this.selectionReason(selectionMode),
      selectedDetection: detection
        ? {
            id: detection.id,
            nightDate: detection.nightDate.toISOString(),
            bedtime: detection.bedtime?.toISOString() ?? null,
            wakeTime: detection.wakeTime?.toISOString() ?? null,
            durationHours: detection.durationHours,
            interruptionCount: detection.interruptionCount,
            continuity: detection.continuity,
            regularity: detection.regularity,
            validCoverage: detection.validCoverage,
            confidence: detection.confidence,
          }
        : null,
      selectedStage: stage
        ? {
            id: stage.id,
            nightDate: stage.nightDate.toISOString(),
            remMinutes: stage.remMinutes,
            coreMinutes: stage.coreMinutes,
            deepMinutes: stage.deepMinutes,
            awakeMinutes: stage.awakeMinutes,
            unknownMinutes: stage.unknownMinutes,
            confidence: stage.confidence,
            source: stage.source,
            epochMinutes: stage.epochMinutes,
          }
        : null,
      selectedNightFeature: feature
        ? {
            id: feature.id,
            nightDate: feature.nightDate.toISOString(),
            restingHeartRate: feature.restingHeartRate,
            rmssd: feature.rmssd,
            sdnn: feature.sdnn,
            respiratoryRate: feature.respiratoryRate,
            continuity: feature.continuity,
            regularity: feature.regularity,
            validCoverage: feature.validCoverage,
            confidenceRaw: feature.confidenceRaw,
            sleepEstimateHours: feature.sleepEstimateHours,
            sourceBlend: feature.sourceBlend,
          }
        : null,
      stageTotals: stage
        ? {
            remMinutes: stage.remMinutes,
            lightMinutes: stage.coreMinutes,
            deepMinutes: stage.deepMinutes,
            awakeMinutes: stage.awakeMinutes,
            unknownMinutes: stage.unknownMinutes,
          }
        : null,
      epochTimelineCount: epochTimeline.length,
      epochTimeline: epochTimeline.map((epoch) => ({
        timestamp: new Date(epoch.timestamp).toISOString(),
        stage: epoch.stage,
      })),
    };
  }

  async getPipelineResults(userId: string) {
    this.assertEnabled();
    const [results, rawRecordCount, earliestRaw, latestRaw] = await Promise.all([
      this.pipelineService.getResults(userId),
      this.rawSensorRepo.count({ where: { userId } }),
      this.rawSensorRepo.findOne({ where: { userId }, order: { timestamp: 'ASC' } }),
      this.rawSensorRepo.findOne({ where: { userId }, order: { timestamp: 'DESC' } }),
    ]);

    return {
      rawRecordCount,
      earliestRawTimestamp: earliestRaw?.timestamp?.toISOString() ?? null,
      latestRawTimestamp: latestRaw?.timestamp?.toISOString() ?? null,
      results,
    };
  }

  async runPipeline(userId: string, dateInput?: string) {
    this.assertEnabled();
    const runResult = await this.pipelineService.runPipeline(userId);
    const overview = await this.getOverview(userId, dateInput);
    return { runResult, overview };
  }

  async recomputeViews(userId: string, dateInput?: string) {
    this.assertEnabled();
    const selectedDate = this.dayKey(this.resolveSelectedDate(dateInput));
    const [homeView, sleepView, overview] = await Promise.all([
      this.viewsService.getHomeView(userId, selectedDate),
      this.viewsService.getSleepView(userId, selectedDate),
      this.getOverview(userId, selectedDate),
    ]);

    return { selectedDate, homeView, sleepView, overview };
  }

  private resolveSelectedDate(dateInput?: string) {
    if (dateInput && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      const [year, month, day] = dateInput.split('-').map(Number);
      return new Date(year, month - 1, day, 12, 0, 0, 0);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  }

  private dayKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private localDayBounds(date: Date) {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  private isToday(date: Date) {
    const now = new Date();
    return this.dayKey(date) === this.dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0));
  }

  private selectByDayOrLatestForToday<T extends Record<string, any>>(
    items: T[],
    key: keyof T,
    selectedKey: string,
    selectedDate: Date,
  ): SelectionResult<T> {
    const exact = items.find((item) => this.dayKey(item[key] as Date) === selectedKey) ?? null;
    if (exact) return { item: exact, mode: 'exactMatch' };
    if (this.isToday(selectedDate) && items.length > 0) {
      return {
        item: items[items.length - 1],
        mode: 'fallbackToLatestCompletedNight',
      };
    }
    return { item: null, mode: 'noNightAvailable' };
  }

  private pickSelectionMode(
    detectionSelection: SelectionResult<SleepDetection>,
    stageSelection: SelectionResult<SleepStage>,
    featureSelection: SelectionResult<NightFeature>,
  ): SelectionMode {
    if (detectionSelection.item) return detectionSelection.mode;
    if (stageSelection.item) return stageSelection.mode;
    if (featureSelection.item) return featureSelection.mode;
    return 'noNightAvailable';
  }

  private selectionReason(mode: SelectionMode) {
    switch (mode) {
      case 'exactMatch':
        return 'Selected date resolved to a matching stored night.';
      case 'fallbackToLatestCompletedNight':
        return 'No exact match for the selected date, so the latest completed stored night was used.';
      default:
        return 'No sleep night is available for the selected date window.';
    }
  }

  private formatSelectedDateTitle(date: Date) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0, 0);
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0, 0);
    const key = this.dayKey(date);
    if (key === this.dayKey(today)) return 'Today';
    if (key === this.dayKey(yesterday)) return 'Yesterday';
    if (key === this.dayKey(tomorrow)) return 'Tomorrow';
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    }).format(date);
  }

  private formatSelectedDateSubtitle(date: Date) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  }
}
