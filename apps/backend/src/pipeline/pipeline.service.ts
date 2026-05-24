import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository, MoreThanOrEqual } from 'typeorm';
import { randomUUID } from 'crypto';

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
import { PipelineState } from './entities/pipeline-state.entity.js';
import { PipelineRun } from './entities/pipeline-run.entity.js';

import { IngestDto } from './dto/ingest.dto.js';
import { IngestTableDto } from './dto/ingest-table.dto.js';

import { sanitize } from '../processing/ppg-quality-gate.js';
import {
  buildNightFeatureSet,
  effectiveSleepFeatureSet,
  computeDailyScore,
  recomputeBaselineProfile,
} from '../processing/wellness-scoring.js';
import { SleepEventEngine, buildOffWristIntervals } from '../processing/sleep-event-engine.js';
import { DeviceEvent } from '../telemetry/entities/device-event.entity.js';
import {
  detectActivities,
  detectActivityGaps,
  type ActivityBout,
} from '../processing/activity-detector.js';
import { reclassifyHiking } from '../processing/hiking-detector.js';
import { reclassifyStairs } from '../processing/stair-detector.js';
import { applyHealthkitWorkoutMatches } from '../processing/healthkit-workout-matcher.js';
import { ActivityDetection } from '../activity/entities/activity-detection.entity.js';
import { HealthkitDailySummary } from '../activity/entities/healthkit-daily-summary.entity.js';
import { HealthkitWorkout } from '../activity/entities/healthkit-workout.entity.js';
import { extractEpochFeatures } from '../processing/epoch-features.js';
import { classifySleepStages } from '../processing/sleep-stage-classifier.js';
import { median } from '../processing/utils.js';
import {
  computeDerivedMetrics,
  precomputeMetricSeries,
} from '../processing/derived-metrics.js';
import { computeSleepScoreForNight } from '../processing/sleep-score.js';
import { computeTypicalRanges } from '../processing/typical-ranges.js';
import { journalSleepCorrelations } from '../processing/journal-correlations.js';
import {
  calendarDayBounds,
  calendarDayKey,
  calendarDayStart,
  resolveTimeZone,
} from '../common/calendar.js';

import type {
  SignalSample,
  HistoricalSensorRecord,
  BaselineProfile as BaselineProfileInterface,
  JournalFactorEntry,
  DerivedMetricsBundle,
} from '../processing/interfaces.js';
import { ComputeEngineClient } from './compute-engine-client.js';
import {
  buildBatchRequest,
  liftActivityBouts,
  liftPersistedToBundle,
} from './compute-engine-bridge.js';
import type { PersistedDailyMetricV1 } from './compute-engine-types.js';

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
    @InjectRepository(PipelineState)
    private pipelineStateRepo: Repository<PipelineState>,
    @InjectRepository(PipelineRun)
    private pipelineRunRepo: Repository<PipelineRun>,
    @InjectRepository(DeviceEvent)
    private deviceEventRepo: Repository<DeviceEvent>,
    private dataSource: DataSource,
    private readonly computeEngineClient: ComputeEngineClient,
  ) {}

  // Per-user TZ fallback. `user.timeZone` is populated by SessionGuard whenever
  // a request lands with ?timeZone=<IANA>. Returns undefined if not stored,
  // letting resolveTimeZone fall back to UTC.
  private async userTimeZone(userId: string): Promise<string | undefined> {
    try {
      const rows = await this.dataSource.query(
        'SELECT "timeZone" FROM "user" WHERE id = $1 LIMIT 1',
        [userId],
      );
      const tz = rows?.[0]?.timeZone;
      return typeof tz === 'string' && tz.length > 0 ? tz : undefined;
    } catch {
      return undefined;
    }
  }

  // ------------------------------------------------------------------ ingest
  async ingest(userId: string, dto: IngestDto) {
    let signalCount = 0;
    let sensorCount = 0;

    // Signal samples — delete old for user, then bulk insert. Wrapped in a
    // transaction so concurrent readers (e.g. an overlapping /pipeline/run
    // call mid-ingest) never observe the post-delete-pre-insert empty
    // window. A crash between delete and insert would otherwise leave us
    // with no samples for that range until the next ingest reposts the
    // batch.
    if (dto.signalSamples && dto.signalSamples.length > 0) {
      const timestamps = dto.signalSamples.map((s) => new Date(s.timestamp));
      const minTs = new Date(Math.min(...timestamps.map((t) => t.getTime())));
      const maxTs = new Date(Math.max(...timestamps.map((t) => t.getTime())));
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
      await this.signalSampleRepo.manager.transaction(async (manager) => {
        await manager
          .createQueryBuilder()
          .delete()
          .from(SignalSampleEntity)
          .where('"userId" = :userId', { userId })
          .andWhere('timestamp >= :minTs', { minTs })
          .andWhere('timestamp <= :maxTs', { maxTs })
          .execute();
        await manager.save(SignalSampleEntity, entities, { chunk: 500 });
      });
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

    // Unknown table — reject with 400. The mobile drainer treated the prior
    // 2xx ack as "shipped" and deleted the queue rows, silently dropping data
    // for tables routed through this endpoint that lacked a handler (codex
    // adversarial review 2026-05-21, finding #1). Failing loud forces the
    // drainer to retain the row until a real handler ships.
    this.logger.warn(
      `ingestTable: tableName=${tableName} has no handler; refusing ${rows.length} rows`,
    );
    throw new BadRequestException(
      `ingestTable: no handler registered for table "${tableName}"`,
    );
  }

  // -------------------------------------------------------------- runPipeline
  // `opts.from` / `opts.to` narrow the data window the pipeline operates
  // on. Default is the trailing 45 days. Narrowing is honest end-to-end:
  // the fetch, prune, and upsert phases all use the same bounds, so a
  // single-day rerun only touches that day's derived rows. Baseline is
  // recomputed from whatever night_features fall in the window — for
  // narrow windows this means baseline drift; the inspector labels
  // narrow runs so the user can tell at a glance.
  //
  // `opts.force` bypasses the watermark short-circuit. Use when you've
  // changed processing code and want to re-derive even if no raw inputs
  // have advanced.
  async runPipeline(
    userId: string,
    timeZoneInput?: string,
    opts: {
      from?: Date
      to?: Date
      force?: boolean
      // When set, the existing `pipeline_runs` row with this id is
      // updated in place at end-of-run instead of inserting a new
      // history row. enqueuePipelineRun pre-creates the row so the
      // controller can return 202 + runId immediately.
      runId?: string
    } = {},
  ) {
    const resolvedTzInput = timeZoneInput ?? (await this.userTimeZone(userId));
    const timeZone = resolveTimeZone(resolvedTzInput);
    const now = opts.to ?? new Date();
    const cutoff =
      opts.from ?? new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
    const windowFromExplicit = opts.from ?? null;
    const windowToExplicit = opts.to ?? null;
    const forced = opts.force === true;
    const startedAt = Date.now();

    // 0. Incremental short-circuit: if neither raw_sensor_records nor
    // signal_samples have advanced since the last successful run, the
    // pipeline's outputs would be identical — skip the full ~10–25s
    // compute. This makes idle re-syncs (the common case once nothing
    // is changing) effectively free.
    const currentInputMax = await this.maxInputUpdatedAt(userId, cutoff);
    const state = await this.pipelineStateRepo.findOne({ where: { userId } });
    if (
      !forced &&
      currentInputMax != null &&
      state?.lastInputMaxUpdatedAt != null &&
      currentInputMax <= state.lastInputMaxUpdatedAt.getTime()
    ) {
      // Record the skipped run so the inspector shows steady cadence
      // rather than gaps. When invoked via the async path, update the
      // pre-created queued row instead of inserting a new history row.
      const skippedHistory = opts.runId
        ? this.pipelineRunRepo.update(
            { id: opts.runId },
            {
              durationMs: Date.now() - startedAt,
              skipped: true,
              stages: null,
              detections: 0,
              sleepStages: 0,
              features: 0,
              windowFrom: windowFromExplicit,
              windowTo: windowToExplicit,
              forced,
              status: 'succeeded',
              completedAt: new Date(),
            },
          )
        : this.pipelineRunRepo
        .save({
          userId,
          startedAt: new Date(startedAt),
          durationMs: Date.now() - startedAt,
          skipped: true,
          stages: null,
          detections: 0,
          sleepStages: 0,
          features: 0,
          windowFrom: windowFromExplicit,
          windowTo: windowToExplicit,
          forced,
          status: 'succeeded' as const,
          completedAt: new Date(),
        });
      // Catch async errors from whichever path we took (insert or update).
      void Promise.resolve(skippedHistory)
        .catch((err) =>
          this.logger.warn(
            `pipeline_runs skipped-row write failed: ${err?.message}`,
          ),
        );
      return {
        ok: true,
        skipped: 'no-new-input' as const,
        lastRunAt: state.lastRunAt,
        lastInputMaxUpdatedAt: state.lastInputMaxUpdatedAt,
      };
    }

    // Per-stage timing. mark(name) closes the current segment and tags
    // its duration. Used both for the structured log emitted at the end
    // of the run and as the runtime-budget alert input.
    const stages: Record<string, number> = {};
    let lastMark = Date.now();
    const mark = (name: string) => {
      const now = Date.now();
      stages[name] = (stages[name] ?? 0) + (now - lastMark);
      lastMark = now;
    };

    // 1. Fetch raw data
    const [
      dbSignalSamples,
      dbSensorRecords,
      dbBaseline,
      dbSleepPlan,
      dbJournalEntries,
      dbWristEvents,
    ] = await Promise.all([
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
      // WristOn/Off (9/10) + ChargingOn/Off (7/8) drive authoritative
      // off-wrist gating in the sleep engine — see buildOffWristIntervals.
      this.deviceEventRepo.find({
        where: {
          userId,
          capturedAt: MoreThanOrEqual(cutoff),
        },
        order: { capturedAt: 'ASC' },
      }),
    ]);
    mark('fetch');

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

    // Merge persisted signal_samples with samples derived from
    // raw_sensor_records. Persisted entries win on timestamp collision.
    // Previously this gated globally on persistedSignalSamples.length > 0,
    // which meant any stale row in signal_samples (e.g. residue from the
    // pre-drainer sync path) would suppress the derived fallback for every
    // other day in the query range. That left strainScore = null for days
    // with only raw_sensor_records coverage. Always merging fixes it.
    const derivedSignalSamples =
      this.deriveSignalSamplesFromSensorRecords(sensorRecords);
    const samplesByTs = new Map<number, SignalSample>();
    for (const s of derivedSignalSamples) samplesByTs.set(s.timestamp.getTime(), s);
    for (const s of persistedSignalSamples) samplesByTs.set(s.timestamp.getTime(), s);
    const signalSamples = Array.from(samplesByTs.values()).sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
    const sanitized = sanitize(signalSamples);

    const wristEventWindowEnd =
      dbSensorRecords.length > 0
        ? dbSensorRecords[dbSensorRecords.length - 1].timestamp
        : new Date();
    const offWristIntervals = buildOffWristIntervals(
      dbWristEvents
        .filter((e) => [7, 8, 9, 10].includes(e.eventNumber))
        .map((e) => ({ eventNumber: e.eventNumber, capturedAt: e.capturedAt })),
      wristEventWindowEnd,
    );
    const sleepDetections = SleepEventEngine.detect(
      sensorRecords,
      timeZone,
      offWristIntervals,
    );
    mark('sleep-detect');

    // Activity detection on non-sleep daytime periods. Surface off-wrist
    // intervals as their own entries so the user sees where coverage was
    // lost (e.g. charging, BLE drop).
    const sourceLabeledIntervals = buildSourceLabeledOffWristIntervals(
      dbWristEvents,
      wristEventWindowEnd,
    );
    let activityBouts = detectActivities(
      sensorRecords,
      sleepDetections,
      baseline,
      sourceLabeledIntervals,
    );

    // Apply HealthKit-driven reclassifiers (hiking, stairs, Apple workout match)
    if (activityBouts.length > 0) {
      activityBouts = await this.applyHealthkitReclassifiers(
        userId,
        activityBouts,
        sensorRecords,
        baseline,
        timeZone,
      );
    }
    mark('activity-detect');

    // Activity-detection delete+insert is deferred into the transaction
    // below so the prune/upsert work for activity, night features, sleep
    // detections/stages, daily scores/metrics, and the baseline either all
    // land together or none do. Without this, a crash between the delete
    // and the insert would leave the user with detected activities missing
    // for that range until the next pipeline run.

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
    mark('sleep-stages');

    const featureByNightKey = new Map<number, import('../processing/interfaces.js').NightFeatureSet>();
    for (const detection of sleepDetections) {
      const nightEpochs = allEpochFeatures.filter(
        (e) =>
          e.timestamp.getTime() >= detection.bedtime.getTime() &&
          e.timestamp.getTime() <= detection.wakeTime.getTime(),
      );
      const respValues = nightEpochs
        .map((e) => e.respiratoryRate)
        .filter((v): v is number => Number.isFinite(v) && v > 0);
      const respiratoryRate =
        respValues.length > 0
          ? respValues.reduce((a, b) => a + b, 0) / respValues.length
          : null;

      const baseFeature = buildNightFeatureSet(
        sanitized,
        this.startOfDay(detection.nightDate, timeZone),
        baseline,
        {
          bedtime: detection.bedtime,
          wakeTime: detection.wakeTime,
          continuity: detection.continuity,
          regularity: detection.regularity,
          validCoverage: detection.validCoverage,
          sleepEstimateHours: detection.durationHours,
          respiratoryRate,
        },
      );
      const effectiveFeature = effectiveSleepFeatureSet(baseFeature, detection);
      featureByNightKey.set(
        this.dayKey(effectiveFeature.nightDate, timeZone),
        effectiveFeature,
      );
    }

    const effectiveFeatures = [...featureByNightKey.values()].sort(
      (left, right) => left.nightDate.getTime() - right.nightDate.getTime(),
    );
    const recomputedBaseline = recomputeBaselineProfile(effectiveFeatures);

    const stageByNightKey = new Map(
      sleepStages.map((stage) => [this.dayKey(stage.nightDate, timeZone), stage] as const),
    );

    const dailyScores = effectiveFeatures.map((feature) =>
      computeDailyScore(feature, recomputedBaseline, targetMinutes, effectiveFeatures),
    );

    const sleepScoreByNightKey = new Map<number, number | null>();
    for (const detection of sleepDetections) {
      const nightKey = this.dayKey(detection.nightDate, timeZone);
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

    // precomputeMetricSeries does the expensive shared series work for
    // the JS fallback path (stressPoints, spo2Points, skinTemperaturePoints,
    // rollingRmssd). It's ~25 minutes on a 45-day window, so it's deferred
    // until we actually need it — when Rust batch succeeds, Rust does its
    // own per-day precompute server-side and we never hit this code.
    const referenceDays = this.collectReferenceDays(
      sensorRecords,
      sleepDetections,
      effectiveFeatures,
      timeZone,
    );
    const usingRust = this.computeEngineClient.isEnabled();
    const runId = randomUUID();
    const derivedMetricsByDay: { dayDate: Date; metrics: DerivedMetricsBundle }[] = [];
    const rustActivityBouts: ActivityBout[] = [];
    let rustOwnsActivities = false;

    // Phase 2 batch: one HTTP call covers every reference day. Rust loops
    // days internally — Node only allocates the request payload once,
    // avoiding the per-day 65 MiB allocation churn that pushed memory past
    // 4 GiB in Phase 1 per-day. On any failure (network/timeout/parse/etc.)
    // we fall back to the in-process JS loop for ALL days, which keeps the
    // shadow-mode result invariants simple.
    let batchSucceeded = false;
    if (usingRust && referenceDays.length > 0) {
      const batchReq = buildBatchRequest({
        samples: sanitized,
        sensorRecords,
        effectiveFeatures,
        sleepDetections,
        baseline: recomputedBaseline,
        dayDates: referenceDays,
        timeZone,
      });
      const r = await this.computeEngineClient.computeBatch(batchReq, {
        userId,
        runId,
        days: referenceDays.length,
      });
      if (r.ok) {
        const byDay = new Map<string, PersistedDailyMetricV1>();
        for (const entry of r.result.derivedMetricsByDay) {
          byDay.set(entry.dayDate, entry.metrics);
        }
        for (const dayDate of referenceDays) {
          const key = this.startOfDay(dayDate, timeZone)
            .toISOString()
            .slice(0, 10);
          const persisted = byDay.get(key);
          if (!persisted) {
            // Rust returned a different set of day keys than we sent.
            // Treat as malformed and fall back to JS.
            this.logger.warn(
              `compute-engine batch missing day ${key}; falling back to JS`,
            );
            derivedMetricsByDay.length = 0;
            rustActivityBouts.length = 0;
            rustOwnsActivities = false;
            break;
          }
          derivedMetricsByDay.push({
            dayDate,
            metrics: liftPersistedToBundle(persisted),
          });
          rustActivityBouts.push(...liftActivityBouts(persisted));
        }
        if (derivedMetricsByDay.length === referenceDays.length) {
          rustOwnsActivities = true;
          batchSucceeded = true;
        }
      }
    }

    if (!batchSucceeded) {
      // JS in-process loop. Either Rust was disabled, the batch call failed,
      // or the response was missing day keys. Bridge code is bypassed.
      // precomputeMetricSeries is run lazily here so we only pay its ~25-min
      // cost when JS actually has to do the work.
      derivedMetricsByDay.length = 0;
      rustActivityBouts.length = 0;
      rustOwnsActivities = false;
      const metricsPrecomputed = precomputeMetricSeries(sanitized, sensorRecords);
      for (const dayDate of referenceDays) {
        derivedMetricsByDay.push({
          dayDate,
          metrics: computeDerivedMetrics(
            sanitized,
            sensorRecords,
            effectiveFeatures,
            sleepDetections,
            recomputedBaseline,
            dayDate,
            timeZone,
            metricsPrecomputed,
          ),
        });
      }
    }

    // When the Rust path owned every day's compute, prefer its bouts over
    // the TS detector output. The Rust path doesn't emit Off-Wrist /
    // No-Data sentinels yet, so run the standalone gap detector and merge
    // them in so the activity feed still surfaces coverage holes.
    // Otherwise the TS bouts stay (already in `activityBouts`).
    if (rustOwnsActivities) {
      const gaps = detectActivityGaps(
        sensorRecords,
        sleepDetections,
        sourceLabeledIntervals,
      );
      activityBouts = [...rustActivityBouts, ...gaps].sort(
        (a, b) => a.startTime.getTime() - b.startTime.getTime(),
      );
      if (activityBouts.length > 0) {
        activityBouts = await this.applyHealthkitReclassifiers(
          userId,
          activityBouts,
          sensorRecords,
          baseline,
          timeZone,
        );
      }
    }

    const typicalRanges = computeTypicalRanges(sleepDetections, sleepStages, now);
    const correlations = journalSleepCorrelations(
      journalEntries,
      sleepStages,
      sleepDetections,
    );
    const observedDayDates = this.collectReferenceDays(sensorRecords, [], [], timeZone);
    mark('compute');

    // One transaction covers every persistent write in the pipeline:
    // detected activities (delete+insert), prune-stale of calendar-day
    // tables, the five per-day upserts, and the baseline. Either every
    // computed slice of this run lands, or none does — no half-applied
    // state on a crash. The transaction uses a single connection so the
    // per-table loops run sequentially rather than via Promise.all; with
    // one connection in play, Promise.all wouldn't have produced real
    // parallelism anyway.
    await this.nightFeatureRepo.manager.transaction(async (manager) => {
      const activityRepo = manager.getRepository(ActivityDetection);
      const nightFeatureRepo = manager.getRepository(NightFeature);
      const sleepDetectionRepo = manager.getRepository(SleepDetection);
      const sleepStageRepo = manager.getRepository(SleepStage);
      const dailyScoreRepo = manager.getRepository(DailyScore);
      const dailyMetricRepo = manager.getRepository(DailyMetric);
      const baselineRepo = manager.getRepository(BaselineProfile);

      if (activityBouts.length > 0) {
        const boutStart = activityBouts[0].startTime;
        const boutEnd = activityBouts[activityBouts.length - 1].endTime;
        await activityRepo
          .createQueryBuilder()
          .delete()
          .where('"userId" = :userId', { userId })
          .andWhere('"source" IN (:...sources)', {
            sources: ['detected', 'candidate'],
          })
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
          entity.source = bout.source ?? 'detected';
          return entity;
        });
        await activityRepo.save(entities, { chunk: 200 });
      }

      await this.pruneStaleCalendarDayRows(
        nightFeatureRepo,
        userId,
        'nightDate',
        observedDayDates,
        effectiveFeatures.map((feature) => feature.nightDate),
        timeZone,
      );
      await this.pruneStaleCalendarDayRows(
        sleepDetectionRepo,
        userId,
        'nightDate',
        observedDayDates,
        sleepDetections.map((detection) => detection.nightDate),
        timeZone,
      );
      await this.pruneStaleCalendarDayRows(
        sleepStageRepo,
        userId,
        'nightDate',
        observedDayDates,
        sleepStages.map((stage) => stage.nightDate),
        timeZone,
      );
      await this.pruneStaleCalendarDayRows(
        dailyScoreRepo,
        userId,
        'dayDate',
        observedDayDates,
        dailyScores.map((score) => score.dayDate),
        timeZone,
      );

      for (const feature of effectiveFeatures) {
        await this.upsertNightFeature(
          nightFeatureRepo,
          userId,
          feature,
          this.startOfDay(feature.nightDate, timeZone),
          timeZone,
        );
      }

      for (const detection of sleepDetections) {
        await this.upsertSleepDetection(sleepDetectionRepo, userId, detection, timeZone);
      }

      for (const stage of sleepStages) {
        await this.upsertSleepStage(sleepStageRepo, userId, stage, timeZone);
      }

      for (const score of dailyScores) {
        await this.upsertDailyScore(
          dailyScoreRepo,
          userId,
          score,
          sleepScoreByNightKey.get(this.dayKey(score.dayDate, timeZone)) ?? null,
          timeZone,
        );
      }

      for (const entry of derivedMetricsByDay) {
        await this.upsertDailyMetric(
          dailyMetricRepo,
          userId,
          entry.metrics,
          entry.dayDate,
          timeZone,
        );
      }

      await this.upsertBaseline(baselineRepo, userId, recomputedBaseline);

      // Persist the watermark inside the same transaction so the next run
      // either sees the new state (and skips correctly) or sees the old
      // state (and reruns the full pipeline) — never a half-applied mix.
      const stateRepo = manager.getRepository(PipelineState);
      const next = stateRepo.create({
        userId,
        lastRunAt: new Date(),
        lastInputMaxUpdatedAt:
          currentInputMax != null ? new Date(currentInputMax) : null,
        lastRunDurationMs: Date.now() - startedAt,
      });
      await stateRepo.upsert(next, { conflictPaths: ['userId'] });
    });
    mark('write');

    // Append-only history row for the inspector's regression watch.
    // Separate from pipeline_state so we can chart drift over time
    // without committing every run inside the main transaction. When
    // invoked via the async path, update the pre-created queued row
    // instead of inserting a new one (otherwise GET /pipeline/run/:id
    // would never find a terminal status).
    const totalMs = Date.now() - startedAt;
    const historyWrite = opts.runId
      ? this.pipelineRunRepo.update(
          { id: opts.runId },
          {
            durationMs: totalMs,
            skipped: false,
            stages: { ...stages },
            detections: sleepDetections.length,
            sleepStages: sleepStages.length,
            features: effectiveFeatures.length,
            windowFrom: windowFromExplicit,
            windowTo: windowToExplicit,
            forced,
            status: 'succeeded',
            completedAt: new Date(),
          },
        )
      : this.pipelineRunRepo
      .save({
        userId,
        startedAt: new Date(startedAt),
        durationMs: totalMs,
        skipped: false,
        stages: { ...stages },
        detections: sleepDetections.length,
        sleepStages: sleepStages.length,
        features: effectiveFeatures.length,
        windowFrom: windowFromExplicit,
        windowTo: windowToExplicit,
        forced,
        status: 'succeeded' as const,
        completedAt: new Date(),
      });
    void Promise.resolve(historyWrite).catch((err) =>
      this.logger.warn(`pipeline_runs history write failed: ${err?.message}`),
    );

    // Structured stage breakdown + runtime budget check. The budget is
    // intentionally generous (45s) — exceeding it means a regression
    // worth investigating, not a transient slow run. PIPELINE_BUDGET_MS
    // env var overrides it.
    const budgetMs = Number(process.env.PIPELINE_BUDGET_MS ?? 45_000);
    const breakdown = Object.entries(stages)
      .map(([k, v]) => `${k}=${v}ms`)
      .join(' ');
    const summary =
      `Pipeline complete for user=${userId}: ` +
      `detections=${sleepDetections.length} stages=${sleepStages.length} ` +
      `features=${effectiveFeatures.length} total=${totalMs}ms ${breakdown}`;
    if (totalMs > budgetMs) {
      this.logger.warn(
        `${summary} — exceeded PIPELINE_BUDGET_MS=${budgetMs}; possible regression`,
      );
    } else {
      this.logger.log(summary);
    }

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
                this.dayKey(
                  sleepDetections[sleepDetections.length - 1].nightDate,
                  timeZone,
                ),
              ) ?? null
            : null,
        typicalRanges: typicalRanges != null ? 1 : 0,
        journalCorrelations: correlations.length,
      },
    };
  }

  // -------------------------------------------------------------- getResults
  // -------------------------------------------------------- async run API
  // POST /pipeline/run handler: create a queued row and kick off the
  // worker in the background. Concurrent POSTs that arrive while a run
  // is already queued/running for this user return that runId so the
  // client can poll the same job (codex adversarial review 2026-05-21,
  // finding #3).
  async enqueuePipelineRun(userId: string, timeZoneInput?: string) {
    const existing = await this.pipelineRunRepo.findOne({
      where: [
        { userId, status: 'queued' as any },
        { userId, status: 'running' as any },
      ],
      order: { startedAt: 'DESC' },
    });
    if (existing) {
      return {
        runId: existing.id,
        status: existing.status,
        startedAt: existing.startedAt.toISOString(),
        deduped: true,
      };
    }

    const row = await this.pipelineRunRepo.save({
      userId,
      startedAt: new Date(),
      durationMs: 0,
      skipped: false,
      stages: null,
      detections: 0,
      sleepStages: 0,
      features: 0,
      windowFrom: null,
      windowTo: null,
      forced: false,
      status: 'queued' as const,
      completedAt: null,
      error: null,
    });

    // Phase A.3: when PIPELINE_WORKER_URL is set, hand off to the Rust
    // worker. Falls back to the in-process path on any failure so a
    // misconfigured worker URL never strands a user.
    const workerUrl = process.env.PIPELINE_WORKER_URL?.trim();
    if (workerUrl) {
      const delegated = await this.delegateToWorker(
        workerUrl,
        userId,
        timeZoneInput,
        row.id,
      );
      if (delegated) {
        await this.pipelineRunRepo.update(
          { id: row.id },
          { workerSource: 'rust-worker' },
        );
        return {
          runId: row.id,
          status: row.status,
          startedAt: row.startedAt.toISOString(),
          deduped: false,
        };
      }
      // Delegation failed — fall through to in-process path. Log loud
      // so we notice the worker is unreachable.
      this.logger.warn(
        `enqueuePipelineRun: worker delegation failed for run ${row.id}; falling back to in-process`,
      );
    }

    await this.pipelineRunRepo.update(
      { id: row.id },
      { workerSource: 'nest-in-process' },
    );

    // Fire-and-forget. The async worker flips status, runs the
    // pipeline, and finalises the row. Cloud Run keeps the instance
    // warm while clients poll GET /pipeline/run/:id, so the post-
    // response work has CPU even on default --cpu-throttling.
    void this.runPipelineAsync(userId, timeZoneInput, row.id);

    return {
      runId: row.id,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      deduped: false,
    };
  }

  private async delegateToWorker(
    workerUrl: string,
    userId: string,
    timeZoneInput: string | undefined,
    runId: string,
  ): Promise<boolean> {
    const url = `${workerUrl.replace(/\/+$/, '')}/v1/worker/run`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          run_id: runId,
          time_zone: timeZoneInput ?? null,
        }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) {
        this.logger.warn(
          `delegateToWorker(${runId}): worker responded ${res.status}`,
        );
        return false;
      }
      return true;
    } catch (err: any) {
      this.logger.warn(
        `delegateToWorker(${runId}): ${err?.message ?? String(err)}`,
      );
      return false;
    }
  }

  private async runPipelineAsync(
    userId: string,
    timeZoneInput: string | undefined,
    runId: string,
  ): Promise<void> {
    try {
      await this.pipelineRunRepo.update(
        { id: runId },
        { status: 'running' },
      );
      await this.runPipeline(userId, timeZoneInput, { runId });
      // runPipeline updates the row with status='succeeded' on its
      // normal terminal paths (skipped or completed). Nothing else to
      // do here on success.
    } catch (err: any) {
      this.logger.error(
        `runPipelineAsync(${runId}) failed: ${err?.message}`,
        err?.stack,
      );
      await this.pipelineRunRepo
        .update(
          { id: runId },
          {
            status: 'failed',
            completedAt: new Date(),
            error: (err?.message ?? String(err)).slice(0, 500),
          },
        )
        .catch((e) =>
          this.logger.warn(
            `pipeline_runs failure write failed: ${e?.message}`,
          ),
        );
    }
  }

  // GET /pipeline/run/:id — used by the client polling loop. Returns a
  // shaped status payload so the client can render progress without
  // exposing every internal column.
  async getPipelineRunStatus(userId: string, runId: string) {
    const row = await this.pipelineRunRepo.findOne({ where: { id: runId } });
    if (!row || row.userId !== userId) {
      throw new (await import('@nestjs/common')).NotFoundException(
        `pipeline run ${runId} not found`,
      );
    }
    return {
      runId: row.id,
      status: row.status,
      skipped: row.skipped,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      heartbeatAt: row.heartbeatAt ? row.heartbeatAt.toISOString() : null,
      durationMs: row.durationMs,
      detections: row.detections,
      sleepStages: row.sleepStages,
      features: row.features,
      stages: row.stages,
      workerSource: row.workerSource,
      error: row.error,
    };
  }

  // Stale-run recovery: any 'running' row whose heartbeatAt hasn't
  // advanced in the threshold window is assumed to belong to a dead
  // worker. We flip it to 'failed' so the user-inflight partial index
  // releases and a fresh run can be enqueued.
  //
  // Called from a periodic task (cron / scheduled job). Returns the
  // number of rows recovered for observability.
  async sweepStalePipelineRuns(staleAfterMs = 5 * 60 * 1000): Promise<number> {
    const cutoff = new Date(Date.now() - staleAfterMs);
    const result = await this.pipelineRunRepo
      .createQueryBuilder()
      .update(PipelineRun)
      .set({
        status: 'failed',
        completedAt: new Date(),
        error: `heartbeat timeout (no beat since ${cutoff.toISOString()})`,
      })
      .where('status = :status', { status: 'running' })
      .andWhere('"heartbeatAt" IS NOT NULL')
      .andWhere('"heartbeatAt" < :cutoff', { cutoff })
      .execute();
    const recovered = result.affected ?? 0;
    if (recovered > 0) {
      this.logger.warn(
        `sweepStalePipelineRuns: recovered ${recovered} run(s) stuck past heartbeat threshold ${staleAfterMs}ms`,
      );
    }
    return recovered;
  }

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

  // Max(updatedAt) across both raw_sensor_records and signal_samples for
  // the user in the 45-day pipeline window. Used as the change-detection
  // watermark — returns ms since epoch (or null when the user has zero
  // data, which short-circuits the watermark check and forces a run).
  private async maxInputUpdatedAt(
    userId: string,
    since: Date,
  ): Promise<number | null> {
    const [rawRow] = await this.rawSensorRepo
      .createQueryBuilder('r')
      .select('MAX(r."updatedAt")', 'max')
      .where('r."userId" = :userId', { userId })
      .andWhere('r."timestamp" >= :since', { since })
      .getRawMany<{ max: Date | string | null }>();
    const [sigRow] = await this.signalSampleRepo
      .createQueryBuilder('s')
      .select('MAX(s."updatedAt")', 'max')
      .where('s."userId" = :userId', { userId })
      .andWhere('s."timestamp" >= :since', { since })
      .getRawMany<{ max: Date | string | null }>();
    const rawMax = rawRow?.max ? new Date(rawRow.max).getTime() : null;
    const sigMax = sigRow?.max ? new Date(sigRow.max).getTime() : null;
    if (rawMax == null && sigMax == null) return null;
    return Math.max(rawMax ?? 0, sigMax ?? 0);
  }

  private async findOneByCalendarDay<T extends { id: string }>(
    repo: Repository<any>,
    userId: string,
    column: 'nightDate' | 'dayDate',
    date: Date,
    timeZone: string,
  ): Promise<T | null> {
    const { start, end } = calendarDayBounds(calendarDayKey(date, timeZone), timeZone);
    const rows = await repo
      .createQueryBuilder('entity')
      .where('entity."userId" = :userId', { userId })
      .andWhere(`entity."${column}" >= :start`, { start })
      .andWhere(`entity."${column}" < :end`, { end })
      .orderBy('entity."updatedAt"', 'DESC')
      .getMany();

    const [existing, ...duplicates] = rows;
    if (duplicates.length > 0) {
      this.logger.warn(
        `findOneByCalendarDay self-heal: deleted ${duplicates.length} duplicate ${column}=${calendarDayKey(date, timeZone)} rows for user=${userId}`,
      );
      await repo.delete(duplicates.map((row) => row.id) as any);
    }
    return existing ?? null;
  }

  private async pruneStaleCalendarDayRows(
    repo: Repository<any>,
    userId: string,
    column: 'nightDate' | 'dayDate',
    candidateDates: Date[],
    keptDates: Date[],
    timeZone: string,
  ) {
    const keptKeys = new Set(keptDates.map((date) => calendarDayKey(date, timeZone)));
    const candidateKeys = [
      ...new Set(candidateDates.map((date) => calendarDayKey(date, timeZone))),
    ];

    for (const candidateKey of candidateKeys) {
      if (keptKeys.has(candidateKey)) continue;
      const { start, end } = calendarDayBounds(candidateKey, timeZone);
      await repo
        .createQueryBuilder()
        .delete()
        .where('"userId" = :userId', { userId })
        .andWhere(`"${column}" >= :start`, { start })
        .andWhere(`"${column}" < :end`, { end })
        .execute();
    }
  }

  // All derived day/night upserts switched to INSERT ... ON CONFLICT
  // DO UPDATE (codex adversarial review 2026-05-21, finding #5). With
  // the UNIQUE (userId, dayDate/nightDate) constraint now in place,
  // read-then-save would race-crash on concurrent /pipeline/run; the
  // upsert path is single-statement and idempotent.
  private async upsertNightFeature(
    repo: Repository<NightFeature>,
    userId: string,
    features: import('../processing/interfaces.js').NightFeatureSet,
    nightDate: Date,
    _timeZone: string,
  ) {
    await repo.upsert(
      {
        userId,
        nightDate,
        restingHeartRate: features.restingHeartRate,
        rmssd: features.rmssd,
        sdnn: features.sdnn,
        pnn50: features.pnn50,
        respiratoryRate: features.respiratoryRate,
        continuity: features.continuity,
        regularity: features.regularity,
        validCoverage: features.validCoverage,
        confidenceRaw: features.confidenceRaw,
        sleepEstimateHours: features.sleepEstimateHours,
        sourceBlend: features.sourceBlend,
      },
      { conflictPaths: ['userId', 'nightDate'] },
    );
  }

  private async upsertSleepDetection(
    repo: Repository<SleepDetection>,
    userId: string,
    detection: import('../processing/interfaces.js').SleepDetectionSummary,
    _timeZone: string,
  ) {
    await repo.upsert(
      {
        userId,
        nightDate: detection.nightDate,
        bedtime: detection.bedtime,
        wakeTime: detection.wakeTime,
        durationHours: detection.durationHours,
        interruptionCount: detection.interruptionCount,
        continuity: detection.continuity,
        regularity: detection.regularity,
        validCoverage: detection.validCoverage,
        confidence: detection.confidence,
      },
      { conflictPaths: ['userId', 'nightDate'] },
    );
  }

  private async upsertSleepStage(
    repo: Repository<SleepStage>,
    userId: string,
    stage: import('../processing/interfaces.js').SleepStageSummary,
    _timeZone: string,
  ) {
    await repo.upsert(
      {
        userId,
        nightDate: stage.nightDate,
        remMinutes: stage.remMinutes,
        coreMinutes: stage.coreMinutes,
        deepMinutes: stage.deepMinutes,
        awakeMinutes: stage.awakeMinutes,
        unknownMinutes: stage.unknownMinutes,
        confidence: stage.confidence,
        source: stage.source,
        epochTimeline: stage.epochTimeline as any,
        epochMinutes: stage.epochMinutes,
      },
      { conflictPaths: ['userId', 'nightDate'] },
    );
  }

  private async upsertDailyScore(
    repo: Repository<DailyScore>,
    userId: string,
    score: import('../processing/interfaces.js').DailyWellnessScore,
    sleepScore: number | null,
    _timeZone: string,
  ) {
    await repo.upsert(
      {
        userId,
        dayDate: score.dayDate,
        dailyBalance: score.dailyBalance,
        loadPressure: score.loadPressure,
        sleepReserveHours: score.sleepReserveHours,
        confidence: score.confidence,
        recommendation: score.recommendation,
        detail: score.detail,
        sleepScore,
      },
      { conflictPaths: ['userId', 'dayDate'] },
    );
  }

  private async upsertDailyMetric(
    repo: Repository<DailyMetric>,
    userId: string,
    metrics: import('../processing/interfaces.js').DerivedMetricsBundle,
    dayDate: Date,
    _timeZone: string,
  ) {
    await repo.upsert(
      {
        userId,
        dayDate,
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
      } as any,
      { conflictPaths: ['userId', 'dayDate'] },
    );
  }

  private async upsertBaseline(
    repo: Repository<BaselineProfile>,
    userId: string,
    baseline: BaselineProfileInterface,
  ) {
    const existing = await repo.findOne({ where: { userId } });
    if (existing) {
      existing.restingHeartRate = baseline.restingHeartRate;
      existing.rmssd = baseline.rmssd;
      existing.sdnn = baseline.sdnn;
      existing.nightsUsed = baseline.nightsUsed;
      existing.maxHeartRate = baseline.maxHeartRate ?? existing.maxHeartRate;
      await repo.save(existing);
    } else {
      const entity = repo.create({
        userId,
        restingHeartRate: baseline.restingHeartRate,
        rmssd: baseline.rmssd,
        sdnn: baseline.sdnn,
        nightsUsed: baseline.nightsUsed,
        ...(baseline.maxHeartRate != null ? { maxHeartRate: baseline.maxHeartRate } : {}),
      });
      await repo.save(entity);
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
    timeZone: string,
  ) {
    const keys = new Set<number>();

    for (const record of sensorRecords) {
      keys.add(this.dayKey(record.timestamp, timeZone));
    }
    for (const detection of sleepDetections) {
      keys.add(this.dayKey(detection.nightDate, timeZone));
    }
    for (const feature of nightFeatures) {
      keys.add(this.dayKey(feature.nightDate, timeZone));
    }

    return [...keys]
      .sort((left, right) => left - right)
      .map((key) => new Date(key));
  }

  private startOfDay(date: Date, timeZone: string) {
    return calendarDayStart(date, timeZone);
  }

  private dayKey(date: Date, timeZone: string) {
    return this.startOfDay(date, timeZone).getTime();
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
    timeZone: string,
  ): Promise<ActivityBout[]> {
    if (bouts.length === 0) return bouts;

    const minStart = bouts[0].startTime;
    const maxEnd = bouts[bouts.length - 1].endTime;

    // Span (with some buffer) for HealthKit lookups
    const dayStart = this.startOfDay(minStart, timeZone);
    const dayEnd = calendarDayBounds(calendarDayKey(maxEnd, timeZone), timeZone).end;
    const startDateKey = calendarDayKey(dayStart, timeZone);
    const endDateKey = calendarDayKey(dayEnd, timeZone);

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
          .andWhere('s."dayDate" >= :start', { start: startDateKey })
          .andWhere(
            's."dayDate" < :end',
            { end: endDateKey },
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

/**
 * Build {start, end, source} intervals for the activity detector. Source
 * distinguishes WristOff vs ChargingOn so the UI can label the entry
 * accurately ("Off-Wrist" vs "Charging" — currently both surface as
 * "Off-Wrist" but we keep the distinction for downstream use).
 */
function buildSourceLabeledOffWristIntervals(
  events: DeviceEvent[],
  windowEnd: Date,
): Array<{ start: Date; end: Date; source: 'WristOff' | 'ChargingOn' | null }> {
  const MAX_OFF_WRIST_MS = 24 * 60 * 60 * 1000;
  const sorted = [...events]
    .filter((e) => [7, 8, 9, 10].includes(e.eventNumber))
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  const intervals: Array<{ start: Date; end: Date; source: 'WristOff' | 'ChargingOn' | null }> = [];
  let wristOffOpen: Date | null = null;
  let chargingOpen: Date | null = null;
  const push = (
    start: Date,
    end: Date,
    source: 'WristOff' | 'ChargingOn',
  ) => {
    const cap = new Date(start.getTime() + MAX_OFF_WRIST_MS);
    const boundedEnd = end.getTime() > cap.getTime() ? cap : end;
    intervals.push({ start, end: boundedEnd, source });
  };
  for (const e of sorted) {
    if (e.eventNumber === 10 && wristOffOpen == null) {
      wristOffOpen = e.capturedAt;
    } else if (e.eventNumber === 9 && wristOffOpen != null) {
      push(wristOffOpen, e.capturedAt, 'WristOff');
      wristOffOpen = null;
    } else if (e.eventNumber === 7 && chargingOpen == null) {
      chargingOpen = e.capturedAt;
    } else if (e.eventNumber === 8 && chargingOpen != null) {
      push(chargingOpen, e.capturedAt, 'ChargingOn');
      chargingOpen = null;
    }
  }
  if (wristOffOpen != null) push(wristOffOpen, windowEnd, 'WristOff');
  if (chargingOpen != null) push(chargingOpen, windowEnd, 'ChargingOn');
  return intervals;
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
      .createQueryBuilder('existing_raw_sensor_records')
      .insert()
      .values(values as any)
      .onConflict(`("userId", timestamp) DO UPDATE SET
        "heartRate"        = CASE WHEN EXCLUDED."heartRate" > 0 THEN EXCLUDED."heartRate" ELSE "existing_raw_sensor_records"."heartRate" END,
        "rrAverageMs"      = COALESCE(EXCLUDED."rrAverageMs",      "existing_raw_sensor_records"."rrAverageMs"),
        "spo2Red"          = COALESCE(EXCLUDED."spo2Red",          "existing_raw_sensor_records"."spo2Red"),
        "spo2IR"           = COALESCE(EXCLUDED."spo2IR",           "existing_raw_sensor_records"."spo2IR"),
        "skinTempRaw"      = COALESCE(EXCLUDED."skinTempRaw",      "existing_raw_sensor_records"."skinTempRaw"),
        "gravityMagnitude" = COALESCE(EXCLUDED."gravityMagnitude", "existing_raw_sensor_records"."gravityMagnitude"),
        "gravityX"         = COALESCE(EXCLUDED."gravityX",         "existing_raw_sensor_records"."gravityX"),
        "gravityY"         = COALESCE(EXCLUDED."gravityY",         "existing_raw_sensor_records"."gravityY"),
        "gravityZ"         = COALESCE(EXCLUDED."gravityZ",         "existing_raw_sensor_records"."gravityZ"),
        "respRateRaw"      = COALESCE(EXCLUDED."respRateRaw",      "existing_raw_sensor_records"."respRateRaw"),
        "skinContact"      = COALESCE(EXCLUDED."skinContact",      "existing_raw_sensor_records"."skinContact"),
        "ppgGreen"         = COALESCE(EXCLUDED."ppgGreen",         "existing_raw_sensor_records"."ppgGreen"),
        "ppgRedIr"         = COALESCE(EXCLUDED."ppgRedIr",         "existing_raw_sensor_records"."ppgRedIr"),
        "ambientLight"     = COALESCE(EXCLUDED."ambientLight",     "existing_raw_sensor_records"."ambientLight"),
        "ledDrive1"        = COALESCE(EXCLUDED."ledDrive1",        "existing_raw_sensor_records"."ledDrive1"),
        "ledDrive2"        = COALESCE(EXCLUDED."ledDrive2",        "existing_raw_sensor_records"."ledDrive2"),
        "signalQuality"    = COALESCE(EXCLUDED."signalQuality",    "existing_raw_sensor_records"."signalQuality"),
        -- Bump the change-detection watermark on every merge so the
        -- incremental pipeline sees this row as updated.
        "updatedAt"        = NOW()
      `)
      .execute();
    total += slice.length;
  }
  return total;
}
