import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';

import { SleepDetection } from '../sleep/entities/sleep-detection.entity.js';
import { SleepStage } from '../sleep/entities/sleep-stage.entity.js';
import { NightFeature } from '../sleep/entities/night-feature.entity.js';
import { DailyScore } from '../wellness/entities/daily-score.entity.js';
import { DailyMetric } from '../wellness/entities/daily-metric.entity.js';
import { SignalSample as SignalSampleEntity } from '../wellness/entities/signal-sample.entity.js';
import { BaselineProfile } from '../plans/baseline-profile.entity.js';
import { JournalEntry } from '../journal/journal-entry.entity.js';
import { SleepPlan } from '../plans/sleep-plan.entity.js';
import { RawSensorRecord } from './entities/raw-sensor-record.entity.js';

import { IngestDto } from './dto/ingest.dto.js';
import { IngestTableDto } from './dto/ingest-table.dto.js';

import { sanitize } from '../processing/ppg-quality-gate.js';
import {
  buildNightFeatureSet,
  effectiveSleepFeatureSet,
  computeDailyScore,
  recomputeBaselineProfile,
} from '../processing/wellness-scoring.js';
import { SleepEventEngine } from '../processing/sleep-event-engine.js';
import { detectActivities, type ActivityBout } from '../processing/activity-detector.js';
import { reclassifyHiking } from '../processing/hiking-detector.js';
import { reclassifyStairs } from '../processing/stair-detector.js';
import { applyHealthkitWorkoutMatches } from '../processing/healthkit-workout-matcher.js';
import { ActivityDetection } from '../activity/entities/activity-detection.entity.js';
import { HealthkitDailySummary } from '../activity/entities/healthkit-daily-summary.entity.js';
import { HealthkitWorkout } from '../activity/entities/healthkit-workout.entity.js';
import { extractEpochFeatures } from '../processing/epoch-features.js';
import { classifySleepStages } from '../processing/sleep-stage-classifier.js';
import { median } from '../processing/utils.js';
import { computeDerivedMetrics } from '../processing/derived-metrics.js';
import { computeSleepScoreForNight } from '../processing/sleep-score.js';
import { computeTypicalRanges } from '../processing/typical-ranges.js';
import { journalSleepCorrelations } from '../processing/journal-correlations.js';

import type {
  SignalSample,
  HistoricalSensorRecord,
  BaselineProfile as BaselineProfileInterface,
  JournalFactorEntry,
} from '../processing/interfaces.js';

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

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
    @InjectRepository(SignalSampleEntity)
    private signalSampleRepo: Repository<SignalSampleEntity>,
    @InjectRepository(BaselineProfile)
    private baselineRepo: Repository<BaselineProfile>,
    @InjectRepository(JournalEntry)
    private journalRepo: Repository<JournalEntry>,
    @InjectRepository(SleepPlan)
    private sleepPlanRepo: Repository<SleepPlan>,
    @InjectRepository(RawSensorRecord)
    private rawSensorRepo: Repository<RawSensorRecord>,
    @InjectRepository(ActivityDetection)
    private activityDetectionRepo: Repository<ActivityDetection>,
    @InjectRepository(HealthkitDailySummary)
    private healthkitSummaryRepo: Repository<HealthkitDailySummary>,
    @InjectRepository(HealthkitWorkout)
    private healthkitWorkoutRepo: Repository<HealthkitWorkout>,
  ) {}

  // ------------------------------------------------------------------ ingest
  async ingest(userId: string, dto: IngestDto) {
    let signalCount = 0;
    let sensorCount = 0;

    // Signal samples — delete old for user, then bulk insert
    if (dto.signalSamples && dto.signalSamples.length > 0) {
      const timestamps = dto.signalSamples.map((s) => new Date(s.timestamp));
      const minTs = new Date(Math.min(...timestamps.map((t) => t.getTime())));
      const maxTs = new Date(Math.max(...timestamps.map((t) => t.getTime())));

      // Delete existing in the date range (much faster than IN with thousands of timestamps)
      await this.signalSampleRepo
        .createQueryBuilder()
        .delete()
        .where('"userId" = :userId', { userId })
        .andWhere('timestamp >= :minTs', { minTs })
        .andWhere('timestamp <= :maxTs', { maxTs })
        .execute();

      const entities = dto.signalSamples.map((s) => {
        const entity = new SignalSampleEntity();
        entity.userId = userId;
        entity.timestamp = new Date(s.timestamp);
        entity.source = s.source;
        entity.heartRate = s.heartRate;
        entity.ibiMs = s.ibiMs as any;
        entity.motionScore = s.motionScore as any;
        entity.qualityScore = s.qualityScore;
        return entity;
      });
      await this.signalSampleRepo.save(entities, { chunk: 500 });
      signalCount = entities.length;
    }

    // Historical sensor records — COALESCE upsert keyed on (userId, timestamp).
    // The strap emits multiple packet formats per timestamp (V12/V24 full,
    // generic HR-only) and re-sends on every reconnect. Merge-upsert lets each
    // packet contribute its non-null fields without overwriting valid sensor
    // data with zeros.
    if (dto.historicalSensorRecords && dto.historicalSensorRecords.length > 0) {
      const merged = dedupeRawSensorRows(
        dto.historicalSensorRecords.map((r) => ({
          timestamp: new Date(r.timestamp),
          heartRate: validHeartRate(r.heartRate),
          rrAverageMs: r.rrAverageMs ?? null,
          spo2Red: r.spo2Red ?? null,
          spo2IR: r.spo2IR ?? null,
          skinTempRaw: r.skinTempRaw ?? null,
          gravityMagnitude: r.gravityMagnitude ?? null,
          gravityX: r.gravityX ?? null,
          gravityY: r.gravityY ?? null,
          gravityZ: r.gravityZ ?? null,
          respRateRaw: r.respRateRaw ?? null,
          skinContact: r.skinContact ?? null,
          ppgGreen: r.ppgGreen ?? null,
          ppgRedIr: r.ppgRedIr ?? null,
          ambientLight: r.ambientLight ?? null,
          ledDrive1: r.ledDrive1 ?? null,
          ledDrive2: r.ledDrive2 ?? null,
          signalQuality: r.signalQuality ?? null,
        })),
      );
      sensorCount = await upsertRawSensorRows(
        this.rawSensorRepo,
        userId,
        merged,
      );
    }

    return { signalSamples: signalCount, sensorRecords: sensorCount };
  }

  // ------------------------------------------------------------ ingestTable
  // Generic per-table sink for the mobile outbound_queue drainer. The drainer
  // POSTs `{ tableName, rows }` for any locally-mutated table. Routes by
  // tableName. For tables that already have a dedicated direct endpoint
  // (telemetry events, journal entries) we accept the rows so the drainer
  // clears them from its queue, but rely on the direct endpoint as the
  // canonical write path. Adding real per-row writes here is a follow-up.
  async ingestTable(userId: string, dto: IngestTableDto) {
    const { tableName, rows } = dto;
    if (!Array.isArray(rows) || rows.length === 0) {
      return { table: tableName, stored: 0 };
    }

    if (tableName === 'raw_sensor_records') {
      // COALESCE upsert keyed on (userId, timestamp). See ingest() above for
      // the why — same dedup-merge pattern across both ingest paths.
      const num = (v: unknown): number | null => {
        if (v == null) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };
      const merged = dedupeRawSensorRows(
        rows
          .filter((r) => Number.isFinite(Number(r.timestamp)))
          .map((r) => ({
            timestamp: new Date(Number(r.timestamp)),
            heartRate: validHeartRate(num(r.heartRate)),
            rrAverageMs: num(r.rrAverageMs),
            spo2Red: num(r.spo2Red),
            spo2IR: num(r.spo2IR),
            skinTempRaw: num(r.skinTempRaw),
            gravityMagnitude: num(r.gravityMagnitude),
            gravityX: num(r.gravityX),
            gravityY: num(r.gravityY),
            gravityZ: num(r.gravityZ),
            respRateRaw: num(r.respRateRaw),
            // Mobile stores skinContact as 0/1 integer; backend column is boolean.
            skinContact:
              r.skinContact == null ? null : Boolean(Number(r.skinContact)),
            ppgGreen: num(r.ppgGreen),
            ppgRedIr: num(r.ppgRedIr),
            ambientLight: num(r.ambientLight),
            ledDrive1: num(r.ledDrive1),
            ledDrive2: num(r.ledDrive2),
            signalQuality: num(r.signalQuality),
          })),
      );
      const stored = await upsertRawSensorRows(this.rawSensorRepo, userId, merged);
      return { table: tableName, stored };
    }

    // Tables with their own direct endpoints (telemetry, journal). Acked so
    // the queue drains; canonical writes happen on the direct path. Add real
    // per-table handlers here when the direct path becomes optional.
    this.logger.warn(
      `ingestTable: tableName=${tableName} not yet routed; ${rows.length} rows acked without storing`,
    );
    return { table: tableName, stored: 0, ignored: rows.length };
  }

  // -------------------------------------------------------------- runPipeline
  async runPipeline(userId: string) {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);

    // 1. Fetch raw data
    const [dbSignalSamples, dbSensorRecords, dbBaseline, dbSleepPlan, dbJournalEntries] =
      await Promise.all([
        this.signalSampleRepo.find({
          where: { userId, timestamp: MoreThanOrEqual(cutoff) },
          order: { timestamp: 'ASC' },
        }),
        this.rawSensorRepo.find({
          where: { userId, timestamp: MoreThanOrEqual(cutoff) },
          order: { timestamp: 'ASC' },
        }),
        this.baselineRepo.findOne({ where: { userId } }),
        this.sleepPlanRepo.findOne({ where: { userId } }),
        this.journalRepo.find({
          where: { userId, timestamp: MoreThanOrEqual(cutoff) },
          order: { timestamp: 'ASC' },
        }),
      ]);

    // 2. Convert DB records to interface types
    const persistedSignalSamples: SignalSample[] = dbSignalSamples.map((s) => ({
      timestamp: s.timestamp,
      source: s.source,
      heartRate: s.heartRate ?? 0,
      ibiMs: s.ibiMs ?? null,
      motionScore: s.motionScore ?? null,
      qualityScore: s.qualityScore ?? 0,
    }));

    const sensorRecords: HistoricalSensorRecord[] = dbSensorRecords.map((r) => ({
      timestamp: r.timestamp,
      heartRate: r.heartRate,
      rrAverageMs: r.rrAverageMs ?? null,
      spo2Red: r.spo2Red ?? null,
      spo2IR: r.spo2IR ?? null,
      skinTempRaw: r.skinTempRaw ?? null,
      gravityMagnitude: r.gravityMagnitude ?? null,
      gravityX: r.gravityX ?? null,
      gravityY: r.gravityY ?? null,
      gravityZ: r.gravityZ ?? null,
      respRateRaw: r.respRateRaw ?? null,
      skinContact: r.skinContact ?? null,
      ppgGreen: r.ppgGreen ?? null,
      ppgRedIr: r.ppgRedIr ?? null,
      ambientLight: r.ambientLight ?? null,
      ledDrive1: r.ledDrive1 ?? null,
      ledDrive2: r.ledDrive2 ?? null,
      signalQuality: r.signalQuality ?? null,
    }));

    const baseline: BaselineProfileInterface = dbBaseline
      ? {
          restingHeartRate: dbBaseline.restingHeartRate,
          rmssd: dbBaseline.rmssd,
          sdnn: dbBaseline.sdnn,
          nightsUsed: dbBaseline.nightsUsed,
          isWarmedUp: dbBaseline.nightsUsed >= 5,
          maxHeartRate: dbBaseline.maxHeartRate ?? null,
        }
      : { restingHeartRate: 0, rmssd: 0, sdnn: 0, nightsUsed: 0, isWarmedUp: false, maxHeartRate: null };

    const targetMinutes = dbSleepPlan?.targetSleepMinutes ?? 480;

    const journalEntries: JournalFactorEntry[] = dbJournalEntries.map((j) => ({
      timestamp: j.timestamp,
      factorTag: j.factorTag,
      intensity: j.intensity,
      note: j.note,
    }));

    const signalSamples =
      persistedSignalSamples.length > 0
        ? persistedSignalSamples
        : this.deriveSignalSamplesFromSensorRecords(sensorRecords);
    const sanitized = sanitize(signalSamples);

    const sleepDetections = SleepEventEngine.detect(sensorRecords);

    // Activity detection on non-sleep daytime periods
    let activityBouts = detectActivities(sensorRecords, sleepDetections, baseline);

    // Apply HealthKit-driven reclassifiers (hiking, stairs, Apple workout match)
    if (activityBouts.length > 0) {
      activityBouts = await this.applyHealthkitReclassifiers(
        userId,
        activityBouts,
        sensorRecords,
        baseline,
      );
    }

    if (activityBouts.length > 0) {
      // Delete existing detected activities for this user's data range, then insert new
      const boutStart = activityBouts[0].startTime;
      const boutEnd = activityBouts[activityBouts.length - 1].endTime;
      await this.activityDetectionRepo
        .createQueryBuilder()
        .delete()
        .where('"userId" = :userId', { userId })
        .andWhere('"source" = :source', { source: 'detected' })
        .andWhere('"startTime" >= :start', { start: boutStart })
        .andWhere('"startTime" <= :end', { end: boutEnd })
        .execute();

      const entities = activityBouts.map((bout) => {
        const entity = new ActivityDetection();
        entity.userId = userId;
        entity.startTime = bout.startTime;
        entity.endTime = bout.endTime;
        entity.durationMinutes = bout.durationMinutes;
        entity.activityType = bout.activityType;
        entity.intensity = bout.intensity;
        entity.confidence = bout.confidence;
        entity.heartRateAvg = bout.heartRateAvg;
        entity.heartRateMax = bout.heartRateMax;
        entity.strainScore = bout.strainScore;
        entity.cadenceHz = bout.cadenceHz as any;
        entity.flightsCount = (bout.flightsCount ?? null) as any;
        entity.elevationGainMeters = (bout.elevationGainMeters ?? null) as any;
        entity.distanceMeters = (bout.distanceMeters ?? null) as any;
        entity.externalSource = (bout.externalSource ?? null) as any;
        entity.source = 'detected';
        return entity;
      });
      await this.activityDetectionRepo.save(entities, { chunk: 200 });
    }

    // Extract epoch features and classify sleep stages
    const nightMedianHR =
      sensorRecords.length > 0
        ? median(sensorRecords.map((r) => r.heartRate).filter((h) => h > 0))
        : 60;

    const allEpochFeatures = sleepDetections.flatMap((detection) =>
      extractEpochFeatures(
        sensorRecords,
        detection.bedtime,
        detection.wakeTime,
        nightMedianHR,
      ),
    );

    const sleepStages = classifySleepStages(allEpochFeatures, sleepDetections);

    const featureByNightKey = new Map<number, import('../processing/interfaces.js').NightFeatureSet>();
    for (const detection of sleepDetections) {
      const baseFeature = buildNightFeatureSet(
        sanitized,
        this.startOfDay(detection.nightDate),
        baseline,
        {
          bedtime: detection.bedtime,
          wakeTime: detection.wakeTime,
          continuity: detection.continuity,
          regularity: detection.regularity,
          validCoverage: detection.validCoverage,
          sleepEstimateHours: detection.durationHours,
        },
      );
      const effectiveFeature = effectiveSleepFeatureSet(baseFeature, detection);
      featureByNightKey.set(this.dayKey(effectiveFeature.nightDate), effectiveFeature);
    }

    const effectiveFeatures = [...featureByNightKey.values()].sort(
      (left, right) => left.nightDate.getTime() - right.nightDate.getTime(),
    );
    const recomputedBaseline = recomputeBaselineProfile(effectiveFeatures);

    const stageByNightKey = new Map(
      sleepStages.map((stage) => [this.dayKey(stage.nightDate), stage] as const),
    );

    const dailyScores = effectiveFeatures.map((feature) =>
      computeDailyScore(feature, recomputedBaseline, targetMinutes),
    );

    const sleepScoreByNightKey = new Map<number, number | null>();
    for (const detection of sleepDetections) {
      const nightKey = this.dayKey(detection.nightDate);
      const feature = featureByNightKey.get(nightKey) ?? null;
      const stage = stageByNightKey.get(nightKey) ?? null;
      sleepScoreByNightKey.set(
        nightKey,
        computeSleepScoreForNight(
          detection.durationHours,
          targetMinutes,
          stage ?? null,
          detection,
          feature,
          recomputedBaseline,
        ),
      );
    }

    const derivedMetricsByDay = this.collectReferenceDays(
      sensorRecords,
      sleepDetections,
      effectiveFeatures,
    ).map((dayDate) => ({
      dayDate,
      metrics: computeDerivedMetrics(
        sanitized,
        sensorRecords,
        effectiveFeatures,
        sleepDetections,
        recomputedBaseline,
        dayDate,
      ),
    }));

    const typicalRanges = computeTypicalRanges(sleepDetections, sleepStages, now);
    const correlations = journalSleepCorrelations(
      journalEntries,
      sleepStages,
      sleepDetections,
    );

    for (const feature of effectiveFeatures) {
      await this.upsertNightFeature(
        userId,
        feature,
        this.startOfDay(feature.nightDate),
      );
    }

    for (const detection of sleepDetections) {
      await this.upsertSleepDetection(userId, detection);
    }

    for (const stage of sleepStages) {
      await this.upsertSleepStage(userId, stage);
    }

    for (const score of dailyScores) {
      await this.upsertDailyScore(
        userId,
        score,
        sleepScoreByNightKey.get(this.dayKey(score.dayDate)) ?? null,
      );
    }

    for (const entry of derivedMetricsByDay) {
      await this.upsertDailyMetric(userId, entry.metrics, entry.dayDate);
    }

    await this.upsertBaseline(userId, recomputedBaseline);

    this.logger.log(
      `Pipeline complete for user=${userId}: ` +
        `detections=${sleepDetections.length}, stages=${sleepStages.length}, nightlyFeatures=${effectiveFeatures.length}`,
    );

    return {
      ok: true,
      computed: {
        nightFeatures: effectiveFeatures.length,
        sleepDetections: sleepDetections.length,
        sleepStages: sleepStages.length,
        dailyScore: dailyScores.length,
        derivedMetrics: derivedMetricsByDay.length,
        sleepScore:
          sleepDetections.length > 0
            ? sleepScoreByNightKey.get(
                this.dayKey(sleepDetections[sleepDetections.length - 1].nightDate),
              ) ?? null
            : null,
        typicalRanges: typicalRanges != null ? 1 : 0,
        journalCorrelations: correlations.length,
      },
    };
  }

  // -------------------------------------------------------------- getResults
  async getResults(userId: string) {
    const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);

    const [
      nightFeatures,
      sleepDetections,
      sleepStages,
      dailyScores,
      dailyMetrics,
      baselineProfile,
      sleepPlan,
      journalEntries,
    ] = await Promise.all([
      this.nightFeatureRepo.find({
        where: { userId, nightDate: MoreThanOrEqual(cutoff) },
        order: { nightDate: 'ASC' },
      }),
      this.sleepDetectionRepo.find({
        where: { userId, nightDate: MoreThanOrEqual(cutoff) },
        order: { nightDate: 'ASC' },
      }),
      this.sleepStageRepo.find({
        where: { userId, nightDate: MoreThanOrEqual(cutoff) },
        order: { nightDate: 'ASC' },
      }),
      this.dailyScoreRepo.find({
        where: { userId, dayDate: MoreThanOrEqual(cutoff) },
        order: { dayDate: 'ASC' },
      }),
      this.dailyMetricRepo.find({
        where: { userId, dayDate: MoreThanOrEqual(cutoff) },
        order: { dayDate: 'ASC' },
      }),
      this.baselineRepo.findOne({ where: { userId } }),
      this.sleepPlanRepo.findOne({ where: { userId } }),
      this.journalRepo.find({
        where: { userId, timestamp: MoreThanOrEqual(cutoff) },
        order: { timestamp: 'ASC' },
      }),
    ]);

    // Compute live values
    const detectionInterfaces = sleepDetections.map((d) => ({
      nightDate: d.nightDate,
      bedtime: d.bedtime,
      wakeTime: d.wakeTime,
      durationHours: d.durationHours,
      interruptionCount: d.interruptionCount,
      continuity: d.continuity,
      regularity: d.regularity,
      validCoverage: d.validCoverage,
      confidence: d.confidence,
    }));

    const stageInterfaces = sleepStages.map((s) => ({
      nightDate: s.nightDate,
      remMinutes: s.remMinutes,
      coreMinutes: s.coreMinutes,
      deepMinutes: s.deepMinutes,
      awakeMinutes: s.awakeMinutes,
      unknownMinutes: s.unknownMinutes,
      confidence: s.confidence,
      source: s.source,
      epochTimeline: (s.epochTimeline as any[]) ?? [],
      epochMinutes: s.epochMinutes,
    }));

    const journalFactorEntries: JournalFactorEntry[] = journalEntries.map((j) => ({
      timestamp: j.timestamp,
      factorTag: j.factorTag,
      intensity: j.intensity,
      note: j.note,
    }));

    const typicalRanges = computeTypicalRanges(
      detectionInterfaces,
      stageInterfaces,
      new Date(),
    );

    const journalCorrelations = journalSleepCorrelations(
      journalFactorEntries,
      stageInterfaces,
      detectionInterfaces,
    );

    return {
      nightFeatures,
      sleepDetections,
      sleepStages,
      dailyScores,
      dailyMetrics,
      baselineProfile,
      sleepPlan,
      typicalRanges,
      journalCorrelations,
    };
  }

  // --------------------------------------------------------- private helpers

  private async upsertNightFeature(
    userId: string,
    features: import('../processing/interfaces.js').NightFeatureSet,
    nightDate: Date,
  ) {
    const existing = await this.nightFeatureRepo.findOne({
      where: { userId, nightDate },
    });

    if (existing) {
      Object.assign(existing, {
        restingHeartRate: features.restingHeartRate,
        rmssd: features.rmssd,
        sdnn: features.sdnn,
        respiratoryRate: features.respiratoryRate,
        continuity: features.continuity,
        regularity: features.regularity,
        validCoverage: features.validCoverage,
        confidenceRaw: features.confidenceRaw,
        sleepEstimateHours: features.sleepEstimateHours,
        sourceBlend: features.sourceBlend,
      });
      await this.nightFeatureRepo.save(existing);
    } else {
      const entity = this.nightFeatureRepo.create({
        userId,
        nightDate,
        restingHeartRate: features.restingHeartRate,
        rmssd: features.rmssd,
        sdnn: features.sdnn,
        respiratoryRate: features.respiratoryRate,
        continuity: features.continuity,
        regularity: features.regularity,
        validCoverage: features.validCoverage,
        confidenceRaw: features.confidenceRaw,
        sleepEstimateHours: features.sleepEstimateHours,
        sourceBlend: features.sourceBlend,
      });
      await this.nightFeatureRepo.save(entity);
    }
  }

  private async upsertSleepDetection(
    userId: string,
    detection: import('../processing/interfaces.js').SleepDetectionSummary,
  ) {
    const nightDate = detection.nightDate;
    const existing = await this.sleepDetectionRepo.findOne({
      where: { userId, nightDate },
    });

    const data = {
      bedtime: detection.bedtime,
      wakeTime: detection.wakeTime,
      durationHours: detection.durationHours,
      interruptionCount: detection.interruptionCount,
      continuity: detection.continuity,
      regularity: detection.regularity,
      validCoverage: detection.validCoverage,
      confidence: detection.confidence,
    };

    if (existing) {
      Object.assign(existing, data);
      await this.sleepDetectionRepo.save(existing);
    } else {
      const entity = this.sleepDetectionRepo.create({ userId, nightDate, ...data });
      await this.sleepDetectionRepo.save(entity);
    }
  }

  private async upsertSleepStage(
    userId: string,
    stage: import('../processing/interfaces.js').SleepStageSummary,
  ) {
    const nightDate = stage.nightDate;
    const existing = await this.sleepStageRepo.findOne({
      where: { userId, nightDate },
    });

    const data = {
      remMinutes: stage.remMinutes,
      coreMinutes: stage.coreMinutes,
      deepMinutes: stage.deepMinutes,
      awakeMinutes: stage.awakeMinutes,
      unknownMinutes: stage.unknownMinutes,
      confidence: stage.confidence,
      source: stage.source,
      epochTimeline: stage.epochTimeline as any,
      epochMinutes: stage.epochMinutes,
    };

    if (existing) {
      Object.assign(existing, data);
      await this.sleepStageRepo.save(existing);
    } else {
      const entity = this.sleepStageRepo.create({ userId, nightDate, ...data });
      await this.sleepStageRepo.save(entity);
    }
  }

  private async upsertDailyScore(
    userId: string,
    score: import('../processing/interfaces.js').DailyWellnessScore,
    sleepScore: number | null,
  ) {
    const dayDate = score.dayDate;
    const existing = await this.dailyScoreRepo.findOne({
      where: { userId, dayDate },
    });

    const data = {
      dailyBalance: score.dailyBalance,
      loadPressure: score.loadPressure,
      sleepReserveHours: score.sleepReserveHours,
      confidence: score.confidence,
      recommendation: score.recommendation,
      detail: score.detail + (sleepScore != null ? `, Sleep score ${sleepScore}` : ''),
    };

    if (existing) {
      Object.assign(existing, data);
      await this.dailyScoreRepo.save(existing);
    } else {
      const entity = this.dailyScoreRepo.create({ userId, dayDate, ...data });
      await this.dailyScoreRepo.save(entity);
    }
  }

  private async upsertDailyMetric(
    userId: string,
    metrics: import('../processing/interfaces.js').DerivedMetricsBundle,
    dayDate: Date,
  ) {
    const existing = await this.dailyMetricRepo.findOne({
      where: { userId, dayDate },
    });

    const data = {
      stressAverage: metrics.stressAverage,
      spo2Average: metrics.spo2Average,
      skinTempAvgCelsius: metrics.skinTempAvgCelsius,
      skinTempDeltaCelsius: metrics.skinTempDeltaCelsius,
      strainScore: metrics.strainScore,
      sleepConsistencyScore: metrics.sleepConsistencyScore,
      detectedSleepNights: metrics.detectedSleepNights,
      lfHfRatioAverage: metrics.lfHfRatioAverage,
      recoveryIndex: metrics.recoveryIndex,
      trainingLoadRatio: metrics.trainingLoadRatio,
      trainingLoadRiskZone: metrics.trainingLoadRiskZone,
      spo2DipCount: metrics.spo2DipCount,
      odiPerHour: metrics.odiPerHour,
      lowestSpo2: metrics.lowestSpo2,
      coreTemperatureEstimate: metrics.coreTemperatureEstimate,
      circadianNadir: metrics.circadianNadir,
      sleepArchitectureScore: metrics.sleepArchitectureScore,
    };

    if (existing) {
      Object.assign(existing, data);
      await this.dailyMetricRepo.save(existing);
    } else {
      const entity = this.dailyMetricRepo.create({ userId, dayDate, ...data } as any);
      await this.dailyMetricRepo.save(entity);
    }
  }

  private async upsertBaseline(
    userId: string,
    baseline: BaselineProfileInterface,
  ) {
    const existing = await this.baselineRepo.findOne({ where: { userId } });
    if (existing) {
      existing.restingHeartRate = baseline.restingHeartRate;
      existing.rmssd = baseline.rmssd;
      existing.sdnn = baseline.sdnn;
      existing.nightsUsed = baseline.nightsUsed;
      existing.maxHeartRate = baseline.maxHeartRate ?? existing.maxHeartRate;
      await this.baselineRepo.save(existing);
    } else {
      const entity = this.baselineRepo.create({
        userId,
        restingHeartRate: baseline.restingHeartRate,
        rmssd: baseline.rmssd,
        sdnn: baseline.sdnn,
        nightsUsed: baseline.nightsUsed,
        ...(baseline.maxHeartRate != null ? { maxHeartRate: baseline.maxHeartRate } : {}),
      });
      await this.baselineRepo.save(entity);
    }
  }

  private deriveSignalSamplesFromSensorRecords(
    records: HistoricalSensorRecord[],
  ): SignalSample[] {
    return records
      .filter((record) => record.heartRate > 0)
      .map((record) => ({
        timestamp: record.timestamp,
        source: 'strap-history',
        heartRate: record.heartRate,
        ibiMs:
          record.rrAverageMs != null
            ? record.rrAverageMs
            : 60_000 / Math.max(record.heartRate, 1),
        motionScore: null,
        qualityScore: record.skinContact === false ? 0 : 1,
      }));
  }

  private collectReferenceDays(
    sensorRecords: HistoricalSensorRecord[],
    sleepDetections: import('../processing/interfaces.js').SleepDetectionSummary[],
    nightFeatures: import('../processing/interfaces.js').NightFeatureSet[],
  ) {
    const keys = new Set<number>();

    for (const record of sensorRecords) {
      keys.add(this.dayKey(record.timestamp));
    }
    for (const detection of sleepDetections) {
      keys.add(this.dayKey(detection.nightDate));
    }
    for (const feature of nightFeatures) {
      keys.add(this.dayKey(feature.nightDate));
    }

    return [...keys]
      .sort((left, right) => left - right)
      .map((key) => new Date(key));
  }

  private startOfDay(date: Date) {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    return value;
  }

  private dayKey(date: Date) {
    return this.startOfDay(date).getTime();
  }

  /**
   * Apply HealthKit-derived reclassifiers to strap-detected bouts:
   *   1. Apple workout cross-match (Cycling, Running, etc.) — boost confidence
   *      and override label if Apple's classifier is more reliable.
   *   2. Stair climbing (uses day's HealthKit flightsClimbed + Z-axis impact).
   *   3. Hiking (long Walking + day flightsClimbed + elevated HR).
   *
   * Order matters: Apple workouts trump heuristics. Stairs run before hiking
   * because a long ascent like a 25-min climb might be either a hike or stairs;
   * hiking checks duration ≥ 20 min, stair detector limits to ≤ 10 min, so
   * they don't overlap.
   */
  private async applyHealthkitReclassifiers(
    userId: string,
    bouts: ActivityBout[],
    sensorRecords: HistoricalSensorRecord[],
    baseline: BaselineProfileInterface,
  ): Promise<ActivityBout[]> {
    if (bouts.length === 0) return bouts;

    const minStart = bouts[0].startTime;
    const maxEnd = bouts[bouts.length - 1].endTime;

    // Span (with some buffer) for HealthKit lookups
    const dayStart = this.startOfDay(minStart);
    const dayEnd = new Date(maxEnd);
    dayEnd.setDate(dayEnd.getDate() + 1);
    dayEnd.setHours(0, 0, 0, 0);

    // Pull workouts in window
    const workouts = await this.healthkitWorkoutRepo
      .createQueryBuilder('w')
      .where('w."userId" = :userId', { userId })
      .andWhere('w."startTime" >= :start', { start: dayStart })
      .andWhere('w."startTime" < :end', { end: dayEnd })
      .getMany();

    // Pull daily summaries in window
    const summaries = await this.healthkitSummaryRepo
      .createQueryBuilder('s')
      .where('s."userId" = :userId', { userId })
      .andWhere('s."dayDate" >= :start', { start: dayStart.toISOString().slice(0, 10) })
      .andWhere(
        's."dayDate" < :end',
        { end: dayEnd.toISOString().slice(0, 10) },
      )
      .getMany();

    const flightsByDay = new Map<string, number | null>();
    for (const s of summaries) {
      flightsByDay.set(s.dayDate, s.flightsClimbed);
    }

    // 1. Apple workout cross-match (highest priority)
    let result = applyHealthkitWorkoutMatches(
      bouts,
      workouts.map((w) => ({
        uuid: w.uuid,
        activityName: w.activityName,
        startTime: w.startTime,
        endTime: w.endTime,
        totalDistanceMeters: w.totalDistanceMeters,
        totalEnergyKcal: w.totalEnergyKcal,
      })),
    );

    // 2. Stair climbing
    const dayBuckets = groupBoutsByDay(result);
    const restaged: ActivityBout[] = [];
    for (const [dayKey, dayBouts] of dayBuckets) {
      const flights = flightsByDay.get(dayKey) ?? null;
      const stairsApplied = reclassifyStairs(dayBouts, sensorRecords, {
        dayFlightsClimbed: flights,
      });

      // 3. Hiking (per-bout, needs day-walking-minutes total)
      const dayWalkingMinutes = stairsApplied
        .filter((b) => b.activityType === 'Walking')
        .reduce((s, b) => s + b.durationMinutes, 0);
      const restingHR = baseline.restingHeartRate > 0 ? baseline.restingHeartRate : 60;

      for (const b of stairsApplied) {
        restaged.push(
          reclassifyHiking(b, {
            dayFlightsClimbed: flights,
            dayWalkingMinutes,
            restingHeartRate: restingHR,
          }),
        );
      }
    }

    return restaged;
  }
}

function groupBoutsByDay(bouts: ActivityBout[]): Map<string, ActivityBout[]> {
  const map = new Map<string, ActivityBout[]>();
  for (const b of bouts) {
    const d = b.startTime;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const arr = map.get(key) ?? [];
    arr.push(b);
    map.set(key, arr);
  }
  return map;
}

// Plausibility filter for HR — strap occasionally emits non-HR bytes (HR=6,
// HR=10) when an unusual packet format slips through the parser. Keeping
// junk values would let them overwrite real readings via the upsert merge.
function validHeartRate(hr: number | null | undefined): number {
  if (hr == null) return 0;
  const n = Number(hr);
  if (!Number.isFinite(n)) return 0;
  if (n < 30 || n > 250) return 0;
  return Math.round(n);
}

interface RawSensorRow {
  timestamp: Date;
  heartRate: number;
  rrAverageMs: number | null;
  spo2Red: number | null;
  spo2IR: number | null;
  skinTempRaw: number | null;
  gravityMagnitude: number | null;
  gravityX: number | null;
  gravityY: number | null;
  gravityZ: number | null;
  respRateRaw: number | null;
  skinContact: boolean | null;
  ppgGreen: number | null;
  ppgRedIr: number | null;
  ambientLight: number | null;
  ledDrive1: number | null;
  ledDrive2: number | null;
  signalQuality: number | null;
}

// Within a single batch the strap can include the same timestamp multiple
// times (V12/V24 + generic). Pre-merge them in JS so the bulk INSERT only
// has one row per timestamp — required because Postgres ON CONFLICT can't
// resolve in-statement duplicates.
function dedupeRawSensorRows(rows: RawSensorRow[]): RawSensorRow[] {
  const byTs = new Map<number, RawSensorRow>();
  for (const r of rows) {
    const key = r.timestamp.getTime();
    const existing = byTs.get(key);
    if (!existing) {
      byTs.set(key, { ...r });
      continue;
    }
    // Merge: prefer non-null/non-zero fields from either side.
    byTs.set(key, mergeRows(existing, r));
  }
  return [...byTs.values()];
}

function mergeRows(a: RawSensorRow, b: RawSensorRow): RawSensorRow {
  const pick = <T>(av: T | null, bv: T | null): T | null =>
    bv != null ? bv : av != null ? av : null;
  return {
    timestamp: a.timestamp,
    heartRate: b.heartRate > 0 ? b.heartRate : a.heartRate,
    rrAverageMs: pick(a.rrAverageMs, b.rrAverageMs),
    spo2Red: pick(a.spo2Red, b.spo2Red),
    spo2IR: pick(a.spo2IR, b.spo2IR),
    skinTempRaw: pick(a.skinTempRaw, b.skinTempRaw),
    gravityMagnitude: pick(a.gravityMagnitude, b.gravityMagnitude),
    gravityX: pick(a.gravityX, b.gravityX),
    gravityY: pick(a.gravityY, b.gravityY),
    gravityZ: pick(a.gravityZ, b.gravityZ),
    respRateRaw: pick(a.respRateRaw, b.respRateRaw),
    skinContact: pick(a.skinContact, b.skinContact),
    ppgGreen: pick(a.ppgGreen, b.ppgGreen),
    ppgRedIr: pick(a.ppgRedIr, b.ppgRedIr),
    ambientLight: pick(a.ambientLight, b.ambientLight),
    ledDrive1: pick(a.ledDrive1, b.ledDrive1),
    ledDrive2: pick(a.ledDrive2, b.ledDrive2),
    signalQuality: pick(a.signalQuality, b.signalQuality),
  };
}

// Postgres COALESCE upsert keyed on the (userId, timestamp) unique index.
// HR uses CASE so HR=0 (our junk sentinel from validHeartRate) doesn't
// overwrite a previously-stored real reading.
async function upsertRawSensorRows(
  repo: Repository<RawSensorRecord>,
  userId: string,
  rows: RawSensorRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const CHUNK = 500;
  let total = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const values = slice.map((r) => ({
      userId,
      timestamp: r.timestamp,
      heartRate: r.heartRate,
      rrAverageMs: r.rrAverageMs,
      spo2Red: r.spo2Red,
      spo2IR: r.spo2IR,
      skinTempRaw: r.skinTempRaw,
      gravityMagnitude: r.gravityMagnitude,
      gravityX: r.gravityX,
      gravityY: r.gravityY,
      gravityZ: r.gravityZ,
      respRateRaw: r.respRateRaw,
      skinContact: r.skinContact,
      ppgGreen: r.ppgGreen,
      ppgRedIr: r.ppgRedIr,
      ambientLight: r.ambientLight,
      ledDrive1: r.ledDrive1,
      ledDrive2: r.ledDrive2,
      signalQuality: r.signalQuality,
    }));
    await repo
      .createQueryBuilder()
      .insert()
      .values(values as any)
      .onConflict(`("userId", timestamp) DO UPDATE SET
        "heartRate"        = CASE WHEN EXCLUDED."heartRate" > 0 THEN EXCLUDED."heartRate" ELSE "heartRate" END,
        "rrAverageMs"      = COALESCE(EXCLUDED."rrAverageMs",      "rrAverageMs"),
        "spo2Red"          = COALESCE(EXCLUDED."spo2Red",          "spo2Red"),
        "spo2IR"           = COALESCE(EXCLUDED."spo2IR",           "spo2IR"),
        "skinTempRaw"      = COALESCE(EXCLUDED."skinTempRaw",      "skinTempRaw"),
        "gravityMagnitude" = COALESCE(EXCLUDED."gravityMagnitude", "gravityMagnitude"),
        "gravityX"         = COALESCE(EXCLUDED."gravityX",         "gravityX"),
        "gravityY"         = COALESCE(EXCLUDED."gravityY",         "gravityY"),
        "gravityZ"         = COALESCE(EXCLUDED."gravityZ",         "gravityZ"),
        "respRateRaw"      = COALESCE(EXCLUDED."respRateRaw",      "respRateRaw"),
        "skinContact"      = COALESCE(EXCLUDED."skinContact",      "skinContact"),
        "ppgGreen"         = COALESCE(EXCLUDED."ppgGreen",         "ppgGreen"),
        "ppgRedIr"         = COALESCE(EXCLUDED."ppgRedIr",         "ppgRedIr"),
        "ambientLight"     = COALESCE(EXCLUDED."ambientLight",     "ambientLight"),
        "ledDrive1"        = COALESCE(EXCLUDED."ledDrive1",        "ledDrive1"),
        "ledDrive2"        = COALESCE(EXCLUDED."ledDrive2",        "ledDrive2"),
        "signalQuality"    = COALESCE(EXCLUDED."signalQuality",    "signalQuality")
      `)
      .execute();
    total += slice.length;
  }
  return total;
}
