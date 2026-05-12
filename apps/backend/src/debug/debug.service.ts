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
import { BaselineProfile } from '../plans/baseline-profile.entity.js';
import { SignalSample } from '../wellness/entities/signal-sample.entity.js';
import { DeviceEvent } from '../telemetry/entities/device-event.entity.js';
import { RealtimeSample } from '../telemetry/entities/realtime-sample.entity.js';
import { ConsoleLog } from '../telemetry/entities/console-log.entity.js';
import { PipelineState } from '../pipeline/entities/pipeline-state.entity.js';
import { PipelineRun } from '../pipeline/entities/pipeline-run.entity.js';
import { ViewsService } from '../views/views.service.js';
import {
  calendarDayBounds,
  calendarDayKey,
  resolveCalendarDate,
  selectCalendarDayItem,
} from '../common/calendar.js';

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
    @InjectRepository(BaselineProfile)
    private readonly baselineRepo: Repository<BaselineProfile>,
    @InjectRepository(SignalSample)
    private readonly signalSampleRepo: Repository<SignalSample>,
    @InjectRepository(DeviceEvent)
    private readonly deviceEventRepo: Repository<DeviceEvent>,
    @InjectRepository(RealtimeSample)
    private readonly realtimeSampleRepo: Repository<RealtimeSample>,
    @InjectRepository(ConsoleLog)
    private readonly consoleLogRepo: Repository<ConsoleLog>,
    @InjectRepository(PipelineState)
    private readonly pipelineStateRepo: Repository<PipelineState>,
    @InjectRepository(PipelineRun)
    private readonly pipelineRunRepo: Repository<PipelineRun>,
  ) {}

  // Recent pipeline runs for the regression-watch view. Returns the
  // most recent `limit` runs (default 30) ordered newest-first plus a
  // simple drift signal: per-stage median over this window so the
  // inspector can highlight individual runs that exceed (e.g.) 2× the
  // median for any stage.
  async getPipelineRuns(userId: string, limit = 30) {
    this.assertEnabled();
    const rows = await this.pipelineRunRepo.find({
      where: { userId },
      order: { startedAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    const stageMedians: Record<string, number> = {};
    const stageNames = new Set<string>();
    for (const row of rows) {
      if (!row.stages) continue;
      for (const name of Object.keys(row.stages)) stageNames.add(name);
    }
    for (const name of stageNames) {
      const values = rows
        .map((r) => r.stages?.[name])
        .filter((v): v is number => typeof v === 'number')
        .sort((a, b) => a - b);
      if (values.length === 0) continue;
      stageMedians[name] = values[Math.floor(values.length / 2)];
    }
    return {
      count: rows.length,
      stageMedians,
      runs: rows.map((r) => ({
        id: r.id,
        startedAt: r.startedAt.toISOString(),
        durationMs: r.durationMs,
        skipped: r.skipped,
        stages: r.stages,
        detections: r.detections,
        sleepStages: r.sleepStages,
        features: r.features,
      })),
    };
  }

  // Snapshot of pipeline state + the data-freshness inputs that drive
  // the incremental short-circuit. Powers the inspector's Pipeline tab.
  async getPipelineState(userId: string) {
    this.assertEnabled();
    const cutoff = new Date(Date.now() - 45 * 24 * 60 * 1000);
    const [state, rawRow, sigRow, rawCounts, sigCounts] = await Promise.all([
      this.pipelineStateRepo.findOne({ where: { userId } }),
      this.rawSensorRepo
        .createQueryBuilder('r')
        .select('MAX(r."updatedAt")', 'max')
        .addSelect('MAX(r."timestamp")', 'latestTimestamp')
        .where('r."userId" = :userId', { userId })
        .andWhere('r."timestamp" >= :cutoff', { cutoff })
        .getRawOne<{ max: Date | string | null; latestTimestamp: Date | string | null }>(),
      this.signalSampleRepo
        .createQueryBuilder('s')
        .select('MAX(s."updatedAt")', 'max')
        .addSelect('MAX(s."timestamp")', 'latestTimestamp')
        .where('s."userId" = :userId', { userId })
        .andWhere('s."timestamp" >= :cutoff', { cutoff })
        .getRawOne<{ max: Date | string | null; latestTimestamp: Date | string | null }>(),
      this.rawSensorRepo.count({ where: { userId, timestamp: MoreThanOrEqual(cutoff) } }),
      this.signalSampleRepo.count({ where: { userId, timestamp: MoreThanOrEqual(cutoff) } }),
    ]);

    const toIso = (v: Date | string | null | undefined) =>
      v ? new Date(v).toISOString() : null;
    const currentMax = (() => {
      const r = rawRow?.max ? new Date(rawRow.max).getTime() : null;
      const s = sigRow?.max ? new Date(sigRow.max).getTime() : null;
      if (r == null && s == null) return null;
      return new Date(Math.max(r ?? 0, s ?? 0)).toISOString();
    })();
    const isDirty = (() => {
      if (currentMax == null) return false;
      if (state?.lastInputMaxUpdatedAt == null) return true;
      return new Date(currentMax).getTime() > state.lastInputMaxUpdatedAt.getTime();
    })();

    return {
      state: state
        ? {
            lastRunAt: toIso(state.lastRunAt),
            lastInputMaxUpdatedAt: toIso(state.lastInputMaxUpdatedAt),
            lastRunDurationMs: state.lastRunDurationMs,
          }
        : null,
      inputs: {
        rawSensorRecords: {
          count: rawCounts,
          latestUpdatedAt: toIso(rawRow?.max),
          latestTimestamp: toIso(rawRow?.latestTimestamp),
        },
        signalSamples: {
          count: sigCounts,
          latestUpdatedAt: toIso(sigRow?.max),
          latestTimestamp: toIso(sigRow?.latestTimestamp),
        },
      },
      currentMaxUpdatedAt: currentMax,
      isDirty,
      windowStart: cutoff.toISOString(),
    };
  }

  assertEnabled() {
    if (!this.enabled) {
      throw new NotFoundException();
    }
  }

  async getOverview(userId: string, dateInput?: string, timeZoneInput?: string) {
    this.assertEnabled();

    const { selectedDate, selectedKey, timeZone } = resolveCalendarDate(
      dateInput,
      timeZoneInput,
    );
    const cutoff = new Date(selectedDate.getTime() - 45 * 24 * 60 * 60 * 1000);
    const { start, end } = calendarDayBounds(selectedKey, timeZone);

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
      this.viewsService.getHomeView(userId, selectedKey, timeZone),
      this.viewsService.getSleepView(userId, selectedKey, timeZone),
    ]);

    const detectionSelection = this.selectByDay(
      recentDetections,
      'nightDate',
      selectedKey,
      selectedDate,
      timeZone,
    );
    const stageSelection = this.selectByDay(
      recentStages,
      'nightDate',
      selectedKey,
      selectedDate,
      timeZone,
    );
    const featureSelection = this.selectByDay(
      recentFeatures,
      'nightDate',
      selectedKey,
      selectedDate,
      timeZone,
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
      selectedDateTitle: this.formatSelectedDateTitle(selectedDate, timeZone),
      selectedDateSubtitle: this.formatSelectedDateSubtitle(selectedDate, timeZone),
      selectedNightDate: selectedNightDate
        ? this.dayKey(selectedNightDate, timeZone)
        : null,
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

  async getRawRecords(
    userId: string,
    dateInput?: string,
    timeZoneInput?: string,
    limit = 200,
  ) {
    this.assertEnabled();
    const { selectedKey, timeZone } = resolveCalendarDate(dateInput, timeZoneInput);
    const { start, end } = calendarDayBounds(selectedKey, timeZone);
    const rows = await this.rawSensorRepo
      .createQueryBuilder('raw')
      .where('raw."userId" = :userId', { userId })
      .andWhere('raw.timestamp >= :start', { start })
      .andWhere('raw.timestamp < :end', { end })
      .orderBy('raw.timestamp', 'DESC')
      .limit(Math.min(Math.max(limit, 1), 5000))
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

  async getSleepNight(userId: string, dateInput?: string, timeZoneInput?: string) {
    this.assertEnabled();
    const { selectedDate, selectedKey, timeZone } = resolveCalendarDate(
      dateInput,
      timeZoneInput,
    );
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

    const detectionSelection = this.selectByDay(
      detections,
      'nightDate',
      selectedKey,
      selectedDate,
      timeZone,
    );
    const stageSelection = this.selectByDay(
      stages,
      'nightDate',
      selectedKey,
      selectedDate,
      timeZone,
    );
    const featureSelection = this.selectByDay(
      features,
      'nightDate',
      selectedKey,
      selectedDate,
      timeZone,
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

  async runPipeline(userId: string, dateInput?: string, timeZoneInput?: string) {
    this.assertEnabled();
    const runResult = await this.pipelineService.runPipeline(userId, timeZoneInput);
    const overview = await this.getOverview(userId, dateInput, timeZoneInput);
    return { runResult, overview };
  }

  async recomputeViews(userId: string, dateInput?: string, timeZoneInput?: string) {
    this.assertEnabled();
    const { selectedKey, timeZone } = resolveCalendarDate(dateInput, timeZoneInput);
    const [homeView, sleepView, overview] = await Promise.all([
      this.viewsService.getHomeView(userId, selectedKey, timeZone),
      this.viewsService.getSleepView(userId, selectedKey, timeZone),
      this.getOverview(userId, selectedKey, timeZone),
    ]);

    return { selectedDate: selectedKey, homeView, sleepView, overview };
  }

  private resolveSelectedDate(dateInput?: string, timeZone?: string) {
    return resolveCalendarDate(dateInput, timeZone).selectedDate;
  }

  private dayKey(date: Date, timeZone?: string) {
    return calendarDayKey(date, timeZone);
  }

  private localDayBounds(date: Date, timeZone?: string) {
    return calendarDayBounds(this.dayKey(date, timeZone), timeZone);
  }

  private isToday(date: Date, timeZone?: string) {
    const now = new Date();
    return this.dayKey(date, timeZone) === this.dayKey(now, timeZone);
  }

  private selectByDay<T extends Record<string, any>>(
    items: T[],
    key: keyof T,
    selectedKey: string,
    selectedDate: Date,
    timeZone?: string,
  ): SelectionResult<T> {
    const exact = selectCalendarDayItem(items, key, selectedKey, timeZone);
    if (exact) return { item: exact, mode: 'exactMatch' };
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

  private formatSelectedDateTitle(date: Date, timeZone?: string) {
    const now = new Date();
    const todayKey = this.dayKey(now, timeZone);
    const yesterdayKey = this.dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000), timeZone);
    const tomorrowKey = this.dayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000), timeZone);
    const key = this.dayKey(date, timeZone);
    if (key === todayKey) return 'Today';
    if (key === yesterdayKey) return 'Yesterday';
    if (key === tomorrowKey) return 'Tomorrow';
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    }).format(date);
  }

  private formatSelectedDateSubtitle(date: Date, timeZone?: string) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  }

  async seedDemoData(userId: string, nights = 7) {
    this.assertEnabled();

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
    const counts = { detections: 0, stages: 0, features: 0, signals: 0, scores: 0, metrics: 0 };

    // Generate N nights ending last night
    for (let i = 0; i < nights; i++) {
      const nightDate = new Date(today);
      nightDate.setDate(nightDate.getDate() - 1 - i);
      const nightKey = this.dayKey(nightDate);

      // Vary bedtime 22:00-23:30, wake 06:00-07:30
      const bedHour = 22 + Math.random() * 1.5;
      const bedtime = new Date(nightDate);
      bedtime.setHours(Math.floor(bedHour), Math.round((bedHour % 1) * 60), 0, 0);

      const sleepDurationHours = 6.5 + Math.random() * 2.5; // 6.5-9h
      const wakeTime = new Date(bedtime.getTime() + sleepDurationHours * 3600_000);
      const totalMinutes = Math.round(sleepDurationHours * 60);

      // Stage distribution (roughly: 50% core, 20% REM, 15% deep, 10% awake, 5% unknown)
      const deepMin = Math.round(totalMinutes * (0.12 + Math.random() * 0.08));
      const remMin = Math.round(totalMinutes * (0.18 + Math.random() * 0.08));
      const awakeMin = Math.round(totalMinutes * (0.03 + Math.random() * 0.06));
      const coreMin = totalMinutes - deepMin - remMin - awakeMin;

      // Generate realistic epoch timeline (1-min epochs with cycling)
      const epochTimeline = this.generateEpochTimeline(bedtime, totalMinutes, {
        deepMin, remMin, awakeMin, coreMin,
      });

      // SleepDetection
      await this.sleepDetectionRepo.save(
        this.sleepDetectionRepo.create({
          userId,
          nightDate,
          bedtime,
          wakeTime,
          durationHours: sleepDurationHours,
          interruptionCount: Math.floor(Math.random() * 4),
          continuity: 0.80 + Math.random() * 0.18,
          regularity: 0.75 + Math.random() * 0.20,
          validCoverage: 0.90 + Math.random() * 0.10,
          confidence: 0.80 + Math.random() * 0.18,
        }),
      );
      counts.detections++;

      // SleepStage
      await this.sleepStageRepo.save(
        this.sleepStageRepo.create({
          userId,
          nightDate,
          remMinutes: remMin,
          coreMinutes: coreMin,
          deepMinutes: deepMin,
          awakeMinutes: awakeMin,
          unknownMinutes: 0,
          confidence: 0.80 + Math.random() * 0.18,
          source: 'Strap',
          epochTimeline,
          epochMinutes: 1,
        }),
      );
      counts.stages++;

      // NightFeature
      const restingHR = 48 + Math.random() * 12; // 48-60 bpm
      await this.nightFeatureRepo.save(
        this.nightFeatureRepo.create({
          userId,
          nightDate,
          restingHeartRate: restingHR,
          rmssd: 35 + Math.random() * 40,
          sdnn: 45 + Math.random() * 35,
          respiratoryRate: 12 + Math.random() * 4,
          continuity: 0.80 + Math.random() * 0.18,
          regularity: 0.75 + Math.random() * 0.20,
          validCoverage: 0.90 + Math.random() * 0.10,
          confidenceRaw: 0.80 + Math.random() * 0.18,
          sleepEstimateHours: sleepDurationHours,
          sourceBlend: 'Strap',
        }),
      );
      counts.features++;

      // SignalSamples — HR chart data (~30s intervals through the night)
      const signals: Partial<SignalSample>[] = [];
      let hrCursor = 65 + Math.random() * 10; // starting HR
      for (let t = bedtime.getTime(); t < wakeTime.getTime(); t += 30_000) {
        const elapsed = (t - bedtime.getTime()) / 3600_000;
        // HR dips during deep sleep (hours 1-3), rises towards morning
        const nightProgress = elapsed / sleepDurationHours;
        const deepDip = nightProgress < 0.4 ? -8 * Math.sin(nightProgress * Math.PI / 0.4) : 0;
        const morningRise = nightProgress > 0.7 ? 6 * ((nightProgress - 0.7) / 0.3) : 0;
        hrCursor += (Math.random() - 0.5) * 2; // random walk
        const hr = Math.max(42, Math.min(90, restingHR + deepDip + morningRise + (hrCursor - 65)));

        signals.push({
          userId,
          timestamp: new Date(t),
          source: 'strap',
          heartRate: Math.round(hr * 10) / 10,
          ibiMs: Math.round(60000 / hr),
          motionScore: Math.random() * 0.3,
          qualityScore: 0.90 + Math.random() * 0.10,
        });
      }
      // Bulk save in chunks
      for (let j = 0; j < signals.length; j += 200) {
        await this.signalSampleRepo.save(
          signals.slice(j, j + 200).map((s) => this.signalSampleRepo.create(s)),
        );
      }
      counts.signals += signals.length;

      // DailyScore (for wake day)
      const wakeDay = new Date(wakeTime);
      wakeDay.setHours(12, 0, 0, 0);
      await this.dailyScoreRepo.save(
        this.dailyScoreRepo.create({
          userId,
          dayDate: wakeDay,
          dailyBalance: Math.round(50 + Math.random() * 45),
          loadPressure: Math.round(20 + Math.random() * 60),
          sleepReserveHours: Math.round((sleepDurationHours - 7.5) * 10) / 10,
          confidence: sleepDurationHours > 7 ? 'High' : 'Medium',
          recommendation: sleepDurationHours > 8 ? 'Build' : sleepDurationHours > 7 ? 'Steady' : 'Restore',
          detail: `Sleep ${Math.round(sleepDurationHours * 10) / 10}h, RHR ${Math.round(restingHR)} bpm`,
        }),
      );
      counts.scores++;

      // DailyMetric
      await this.dailyMetricRepo.save(
        this.dailyMetricRepo.create({
          userId,
          dayDate: wakeDay,
          stressAverage: 20 + Math.random() * 40,
          spo2Average: 95 + Math.random() * 4,
          skinTempAvgCelsius: 31 + Math.random() * 2,
          skinTempDeltaCelsius: -0.5 + Math.random() * 1,
          strainScore: 4 + Math.random() * 12,
          sleepConsistencyScore: 60 + Math.random() * 35,
          detectedSleepNights: 1,
        }),
      );
      counts.metrics++;
    }

    // BaselineProfile (upsert)
    const existing = await this.baselineRepo.findOne({ where: { userId } });
    if (existing) {
      existing.restingHeartRate = 54;
      existing.rmssd = 50;
      existing.sdnn = 62;
      existing.nightsUsed = nights;
      await this.baselineRepo.save(existing);
    } else {
      await this.baselineRepo.save(
        this.baselineRepo.create({
          userId,
          restingHeartRate: 54,
          rmssd: 50,
          sdnn: 62,
          nightsUsed: nights,
        }),
      );
    }

    // SleepPlan (upsert)
    const existingPlan = await this.sleepPlanRepo.findOne({ where: { userId } });
    if (!existingPlan) {
      await this.sleepPlanRepo.save(
        this.sleepPlanRepo.create({
          userId,
          targetSleepMinutes: 480,
          wakeMinutes: 420,
          alarmEnabled: false,
          alarmMinutes: 420,
          smartWakeEnabled: false,
        }),
      );
    }

    return { ok: true, nights, counts };
  }

  private generateEpochTimeline(
    bedtime: Date,
    totalMinutes: number,
    dist: { deepMin: number; remMin: number; awakeMin: number; coreMin: number },
  ) {
    // Realistic sleep architecture: cycles of ~90 min
    // Early night: more deep, late night: more REM
    const epochs: { timestamp: string; stage: string }[] = [];
    const cycleLength = 90;
    const numCycles = Math.ceil(totalMinutes / cycleLength);

    let minuteIndex = 0;
    for (let cycle = 0; cycle < numCycles && minuteIndex < totalMinutes; cycle++) {
      const cycleMinutes = Math.min(cycleLength, totalMinutes - minuteIndex);
      const progress = cycle / Math.max(numCycles - 1, 1); // 0 to 1

      // Early cycles: more deep; late cycles: more REM
      const deepFrac = Math.max(0, 0.25 * (1 - progress));
      const remFrac = 0.10 + 0.25 * progress;
      const awakeFrac = 0.02 + Math.random() * 0.03;
      const coreFrac = 1 - deepFrac - remFrac - awakeFrac;

      // Build stages within this cycle: core → deep → core → REM → (brief awake)
      const stages = [
        { stage: 'core', mins: Math.round(cycleMinutes * coreFrac * 0.5) },
        { stage: 'deep', mins: Math.round(cycleMinutes * deepFrac) },
        { stage: 'core', mins: Math.round(cycleMinutes * coreFrac * 0.5) },
        { stage: 'rem', mins: Math.round(cycleMinutes * remFrac) },
        { stage: 'awake', mins: Math.round(cycleMinutes * awakeFrac) },
      ];

      for (const block of stages) {
        for (let m = 0; m < block.mins && minuteIndex < totalMinutes; m++) {
          const ts = new Date(bedtime.getTime() + minuteIndex * 60_000);
          epochs.push({ timestamp: ts.toISOString(), stage: block.stage });
          minuteIndex++;
        }
      }
    }

    // Fill any remaining minutes
    while (minuteIndex < totalMinutes) {
      const ts = new Date(bedtime.getTime() + minuteIndex * 60_000);
      epochs.push({ timestamp: ts.toISOString(), stage: 'core' });
      minuteIndex++;
    }

    // Bookend: first few minutes awake (falling asleep), last few awake (waking)
    for (let i = 0; i < Math.min(5, epochs.length); i++) epochs[i].stage = 'awake';
    for (let i = Math.max(0, epochs.length - 3); i < epochs.length; i++) epochs[i].stage = 'awake';

    return epochs;
  }

  async getTelemetry(userId: string, limit: number) {
    this.assertEnabled();

    const [events, eventCount] = await this.deviceEventRepo.findAndCount({
      where: { userId },
      order: { capturedAt: 'DESC' },
      take: limit,
    });

    const [realtimeSamples, realtimeCount] = await this.realtimeSampleRepo.findAndCount({
      where: { userId },
      order: { capturedAt: 'DESC' },
      take: limit,
    });

    // Group events by name for summary
    const eventSummary: Record<string, number> = {};
    for (const e of events) {
      eventSummary[e.eventName] = (eventSummary[e.eventName] ?? 0) + 1;
    }

    // Group realtime by session
    const sessionSummary: Record<string, { dataType: string; count: number; earliest: string; latest: string }> = {};
    for (const s of realtimeSamples) {
      if (!sessionSummary[s.sessionId]) {
        sessionSummary[s.sessionId] = {
          dataType: s.dataType,
          count: 0,
          earliest: s.capturedAt.toISOString(),
          latest: s.capturedAt.toISOString(),
        };
      }
      sessionSummary[s.sessionId].count++;
      const ts = s.capturedAt.toISOString();
      if (ts < sessionSummary[s.sessionId].earliest) sessionSummary[s.sessionId].earliest = ts;
      if (ts > sessionSummary[s.sessionId].latest) sessionSummary[s.sessionId].latest = ts;
    }

    // Console logs
    const [consoleLogs, consoleLogCount] = await this.consoleLogRepo.findAndCount({
      where: { userId },
      order: { capturedAt: 'DESC' },
      take: limit,
    });

    // Aggregate device info from metadata
    const deviceInfo: Record<string, any> = {};
    for (const log of consoleLogs) {
      if (log.metadata) {
        Object.assign(deviceInfo, log.metadata);
      }
    }

    return {
      events: {
        totalCount: eventCount,
        summary: eventSummary,
        recent: events.slice(0, 50).map((e) => ({
          eventName: e.eventName,
          eventNumber: e.eventNumber,
          deviceId: e.deviceId,
          capturedAt: e.capturedAt.toISOString(),
          receivedAt: e.receivedAt.toISOString(),
        })),
      },
      realtime: {
        totalCount: realtimeCount,
        sessions: sessionSummary,
        recent: realtimeSamples.slice(0, 50).map((s) => ({
          dataType: s.dataType,
          heartRate: s.heartRate,
          sessionId: s.sessionId,
          capturedAt: s.capturedAt.toISOString(),
        })),
      },
      consoleLogs: {
        totalCount: consoleLogCount,
        deviceInfo: Object.keys(deviceInfo).length > 0 ? deviceInfo : null,
        recent: consoleLogs.slice(0, 100).map((l) => ({
          message: l.message,
          logLevel: l.logLevel,
          deviceId: l.deviceId,
          metadata: l.metadata,
          capturedAt: l.capturedAt.toISOString(),
          receivedAt: l.receivedAt.toISOString(),
        })),
      },
    };
  }
}
