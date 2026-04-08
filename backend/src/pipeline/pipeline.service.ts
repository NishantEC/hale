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

import { sanitize } from '../processing/ppg-quality-gate.js';
import {
  buildNightFeatureSet,
  effectiveSleepFeatureSet,
  computeDailyScore,
  recomputeBaselineProfile,
} from '../processing/wellness-scoring.js';
import { SleepEventEngine } from '../processing/sleep-event-engine.js';
import { detectActivities } from '../processing/activity-detector.js';
import { ActivityDetection } from '../activity/entities/activity-detection.entity.js';
import { extractEpochFeatures } from '../processing/epoch-features.js';
import {
  loadModel,
  classifySleepStages,
} from '../processing/sleep-stage-classifier.js';
import { median } from '../processing/utils.js';
import sleepRfModel from '../processing/models/sleep-rf-v1.json';
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
  private readonly rfModel = loadModel(sleepRfModel);

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

    // Historical sensor records — same approach
    if (dto.historicalSensorRecords && dto.historicalSensorRecords.length > 0) {
      const timestamps = dto.historicalSensorRecords.map((r) => new Date(r.timestamp));
      const minTs = new Date(Math.min(...timestamps.map((t) => t.getTime())));
      const maxTs = new Date(Math.max(...timestamps.map((t) => t.getTime())));

      await this.rawSensorRepo
        .createQueryBuilder()
        .delete()
        .where('"userId" = :userId', { userId })
        .andWhere('timestamp >= :minTs', { minTs })
        .andWhere('timestamp <= :maxTs', { maxTs })
        .execute();

      const entities = dto.historicalSensorRecords.map((r) => {
        const entity = new RawSensorRecord();
        entity.userId = userId;
        entity.timestamp = new Date(r.timestamp);
        entity.heartRate = r.heartRate;
        entity.rrAverageMs = r.rrAverageMs as any;
        entity.spo2Red = r.spo2Red as any;
        entity.spo2IR = r.spo2IR as any;
        entity.skinTempRaw = r.skinTempRaw as any;
        entity.gravityMagnitude = r.gravityMagnitude as any;
        entity.gravityX = r.gravityX as any;
        entity.gravityY = r.gravityY as any;
        entity.gravityZ = r.gravityZ as any;
        entity.respRateRaw = r.respRateRaw as any;
        entity.skinContact = r.skinContact as any;
        entity.ppgGreen = r.ppgGreen as any;
        entity.ppgRedIr = r.ppgRedIr as any;
        entity.ambientLight = r.ambientLight as any;
        entity.ledDrive1 = r.ledDrive1 as any;
        entity.ledDrive2 = r.ledDrive2 as any;
        entity.signalQuality = r.signalQuality as any;
        return entity;
      });
      await this.rawSensorRepo.save(entities, { chunk: 500 });
      sensorCount = entities.length;
    }

    return { signalSamples: signalCount, sensorRecords: sensorCount };
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
    const activityBouts = detectActivities(sensorRecords, sleepDetections, baseline);
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
        entity.source = 'detected';
        return entity;
      });
      await this.activityDetectionRepo.save(entities, { chunk: 200 });
    }

    // Extract epoch features and classify sleep stages using RF model
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

    const sleepStages = classifySleepStages(
      this.rfModel,
      allEpochFeatures,
      sleepDetections,
    );

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
}
