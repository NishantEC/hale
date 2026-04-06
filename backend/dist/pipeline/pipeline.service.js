"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PipelineService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const sleep_detection_entity_js_1 = require("../sleep/entities/sleep-detection.entity.js");
const sleep_stage_entity_js_1 = require("../sleep/entities/sleep-stage.entity.js");
const night_feature_entity_js_1 = require("../sleep/entities/night-feature.entity.js");
const daily_score_entity_js_1 = require("../wellness/entities/daily-score.entity.js");
const daily_metric_entity_js_1 = require("../wellness/entities/daily-metric.entity.js");
const signal_sample_entity_js_1 = require("../wellness/entities/signal-sample.entity.js");
const baseline_profile_entity_js_1 = require("../plans/baseline-profile.entity.js");
const journal_entry_entity_js_1 = require("../journal/journal-entry.entity.js");
const sleep_plan_entity_js_1 = require("../plans/sleep-plan.entity.js");
const raw_sensor_record_entity_js_1 = require("./entities/raw-sensor-record.entity.js");
const ppg_quality_gate_js_1 = require("../processing/ppg-quality-gate.js");
const wellness_scoring_js_1 = require("../processing/wellness-scoring.js");
const sleep_event_engine_js_1 = require("../processing/sleep-event-engine.js");
const sleep_stage_engine_js_1 = require("../processing/sleep-stage-engine.js");
const derived_metrics_js_1 = require("../processing/derived-metrics.js");
const sleep_score_js_1 = require("../processing/sleep-score.js");
const typical_ranges_js_1 = require("../processing/typical-ranges.js");
const journal_correlations_js_1 = require("../processing/journal-correlations.js");
let PipelineService = PipelineService_1 = class PipelineService {
    sleepDetectionRepo;
    sleepStageRepo;
    nightFeatureRepo;
    dailyScoreRepo;
    dailyMetricRepo;
    signalSampleRepo;
    baselineRepo;
    journalRepo;
    sleepPlanRepo;
    rawSensorRepo;
    logger = new common_1.Logger(PipelineService_1.name);
    constructor(sleepDetectionRepo, sleepStageRepo, nightFeatureRepo, dailyScoreRepo, dailyMetricRepo, signalSampleRepo, baselineRepo, journalRepo, sleepPlanRepo, rawSensorRepo) {
        this.sleepDetectionRepo = sleepDetectionRepo;
        this.sleepStageRepo = sleepStageRepo;
        this.nightFeatureRepo = nightFeatureRepo;
        this.dailyScoreRepo = dailyScoreRepo;
        this.dailyMetricRepo = dailyMetricRepo;
        this.signalSampleRepo = signalSampleRepo;
        this.baselineRepo = baselineRepo;
        this.journalRepo = journalRepo;
        this.sleepPlanRepo = sleepPlanRepo;
        this.rawSensorRepo = rawSensorRepo;
    }
    async ingest(userId, dto) {
        let signalCount = 0;
        let sensorCount = 0;
        if (dto.signalSamples && dto.signalSamples.length > 0) {
            const timestamps = dto.signalSamples.map((s) => new Date(s.timestamp));
            const minTs = new Date(Math.min(...timestamps.map((t) => t.getTime())));
            const maxTs = new Date(Math.max(...timestamps.map((t) => t.getTime())));
            await this.signalSampleRepo
                .createQueryBuilder()
                .delete()
                .where('"userId" = :userId', { userId })
                .andWhere('timestamp >= :minTs', { minTs })
                .andWhere('timestamp <= :maxTs', { maxTs })
                .execute();
            const entities = dto.signalSamples.map((s) => {
                const entity = new signal_sample_entity_js_1.SignalSample();
                entity.userId = userId;
                entity.timestamp = new Date(s.timestamp);
                entity.source = s.source;
                entity.heartRate = s.heartRate;
                entity.ibiMs = s.ibiMs;
                entity.motionScore = s.motionScore;
                entity.qualityScore = s.qualityScore;
                return entity;
            });
            await this.signalSampleRepo.save(entities, { chunk: 500 });
            signalCount = entities.length;
        }
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
                const entity = new raw_sensor_record_entity_js_1.RawSensorRecord();
                entity.userId = userId;
                entity.timestamp = new Date(r.timestamp);
                entity.heartRate = r.heartRate;
                entity.rrAverageMs = r.rrAverageMs;
                entity.spo2Red = r.spo2Red;
                entity.spo2IR = r.spo2IR;
                entity.skinTempRaw = r.skinTempRaw;
                entity.gravityMagnitude = r.gravityMagnitude;
                entity.gravityX = r.gravityX;
                entity.gravityY = r.gravityY;
                entity.gravityZ = r.gravityZ;
                entity.respRateRaw = r.respRateRaw;
                entity.skinContact = r.skinContact;
                return entity;
            });
            await this.rawSensorRepo.save(entities, { chunk: 500 });
            sensorCount = entities.length;
        }
        return { signalSamples: signalCount, sensorRecords: sensorCount };
    }
    async runPipeline(userId) {
        const now = new Date();
        const cutoff = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
        const [dbSignalSamples, dbSensorRecords, dbBaseline, dbSleepPlan, dbJournalEntries] = await Promise.all([
            this.signalSampleRepo.find({
                where: { userId, timestamp: (0, typeorm_2.MoreThanOrEqual)(cutoff) },
                order: { timestamp: 'ASC' },
            }),
            this.rawSensorRepo.find({
                where: { userId, timestamp: (0, typeorm_2.MoreThanOrEqual)(cutoff) },
                order: { timestamp: 'ASC' },
            }),
            this.baselineRepo.findOne({ where: { userId } }),
            this.sleepPlanRepo.findOne({ where: { userId } }),
            this.journalRepo.find({
                where: { userId, timestamp: (0, typeorm_2.MoreThanOrEqual)(cutoff) },
                order: { timestamp: 'ASC' },
            }),
        ]);
        const persistedSignalSamples = dbSignalSamples.map((s) => ({
            timestamp: s.timestamp,
            source: s.source,
            heartRate: s.heartRate ?? 0,
            ibiMs: s.ibiMs ?? null,
            motionScore: s.motionScore ?? null,
            qualityScore: s.qualityScore ?? 0,
        }));
        const sensorRecords = dbSensorRecords.map((r) => ({
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
        }));
        const baseline = dbBaseline
            ? {
                restingHeartRate: dbBaseline.restingHeartRate,
                rmssd: dbBaseline.rmssd,
                sdnn: dbBaseline.sdnn,
                nightsUsed: dbBaseline.nightsUsed,
                isWarmedUp: dbBaseline.nightsUsed >= 5,
            }
            : { restingHeartRate: 0, rmssd: 0, sdnn: 0, nightsUsed: 0, isWarmedUp: false };
        const targetMinutes = dbSleepPlan?.targetSleepMinutes ?? 480;
        const journalEntries = dbJournalEntries.map((j) => ({
            timestamp: j.timestamp,
            factorTag: j.factorTag,
            intensity: j.intensity,
            note: j.note,
        }));
        const signalSamples = persistedSignalSamples.length > 0
            ? persistedSignalSamples
            : this.deriveSignalSamplesFromSensorRecords(sensorRecords);
        const sanitized = (0, ppg_quality_gate_js_1.sanitize)(signalSamples);
        const sleepDetections = sleep_event_engine_js_1.SleepEventEngine.detect(sensorRecords);
        const sleepStages = sleep_stage_engine_js_1.SleepStageEngine.detect(sensorRecords, sleepDetections);
        const featureByNightKey = new Map();
        for (const detection of sleepDetections) {
            const baseFeature = (0, wellness_scoring_js_1.buildNightFeatureSet)(sanitized, this.startOfDay(detection.nightDate), baseline, {
                bedtime: detection.bedtime,
                wakeTime: detection.wakeTime,
                continuity: detection.continuity,
                regularity: detection.regularity,
                validCoverage: detection.validCoverage,
                sleepEstimateHours: detection.durationHours,
            });
            const effectiveFeature = (0, wellness_scoring_js_1.effectiveSleepFeatureSet)(baseFeature, detection);
            featureByNightKey.set(this.dayKey(effectiveFeature.nightDate), effectiveFeature);
        }
        const effectiveFeatures = [...featureByNightKey.values()].sort((left, right) => left.nightDate.getTime() - right.nightDate.getTime());
        const recomputedBaseline = (0, wellness_scoring_js_1.recomputeBaselineProfile)(effectiveFeatures);
        const stageByNightKey = new Map(sleepStages.map((stage) => [this.dayKey(stage.nightDate), stage]));
        const dailyScores = effectiveFeatures.map((feature) => (0, wellness_scoring_js_1.computeDailyScore)(feature, recomputedBaseline, targetMinutes));
        const sleepScoreByNightKey = new Map();
        for (const detection of sleepDetections) {
            const nightKey = this.dayKey(detection.nightDate);
            const feature = featureByNightKey.get(nightKey) ?? null;
            const stage = stageByNightKey.get(nightKey) ?? null;
            sleepScoreByNightKey.set(nightKey, (0, sleep_score_js_1.computeSleepScoreForNight)(detection.durationHours, targetMinutes, stage ?? null, detection, feature, recomputedBaseline));
        }
        const derivedMetricsByDay = this.collectReferenceDays(sensorRecords, sleepDetections, effectiveFeatures).map((dayDate) => ({
            dayDate,
            metrics: (0, derived_metrics_js_1.computeDerivedMetrics)(sanitized, sensorRecords, effectiveFeatures, sleepDetections, recomputedBaseline, dayDate),
        }));
        const typicalRanges = (0, typical_ranges_js_1.computeTypicalRanges)(sleepDetections, sleepStages, now);
        const correlations = (0, journal_correlations_js_1.journalSleepCorrelations)(journalEntries, sleepStages, sleepDetections);
        for (const feature of effectiveFeatures) {
            await this.upsertNightFeature(userId, feature, this.startOfDay(feature.nightDate));
        }
        for (const detection of sleepDetections) {
            await this.upsertSleepDetection(userId, detection);
        }
        for (const stage of sleepStages) {
            await this.upsertSleepStage(userId, stage);
        }
        for (const score of dailyScores) {
            await this.upsertDailyScore(userId, score, sleepScoreByNightKey.get(this.dayKey(score.dayDate)) ?? null);
        }
        for (const entry of derivedMetricsByDay) {
            await this.upsertDailyMetric(userId, entry.metrics, entry.dayDate);
        }
        await this.upsertBaseline(userId, recomputedBaseline);
        this.logger.log(`Pipeline complete for user=${userId}: ` +
            `detections=${sleepDetections.length}, stages=${sleepStages.length}, nightlyFeatures=${effectiveFeatures.length}`);
        return {
            ok: true,
            computed: {
                nightFeatures: effectiveFeatures.length,
                sleepDetections: sleepDetections.length,
                sleepStages: sleepStages.length,
                dailyScore: dailyScores.length,
                derivedMetrics: derivedMetricsByDay.length,
                sleepScore: sleepDetections.length > 0
                    ? sleepScoreByNightKey.get(this.dayKey(sleepDetections[sleepDetections.length - 1].nightDate)) ?? null
                    : null,
                typicalRanges: typicalRanges != null ? 1 : 0,
                journalCorrelations: correlations.length,
            },
        };
    }
    async getResults(userId) {
        const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
        const [nightFeatures, sleepDetections, sleepStages, dailyScores, dailyMetrics, baselineProfile, sleepPlan, journalEntries,] = await Promise.all([
            this.nightFeatureRepo.find({
                where: { userId, nightDate: (0, typeorm_2.MoreThanOrEqual)(cutoff) },
                order: { nightDate: 'ASC' },
            }),
            this.sleepDetectionRepo.find({
                where: { userId, nightDate: (0, typeorm_2.MoreThanOrEqual)(cutoff) },
                order: { nightDate: 'ASC' },
            }),
            this.sleepStageRepo.find({
                where: { userId, nightDate: (0, typeorm_2.MoreThanOrEqual)(cutoff) },
                order: { nightDate: 'ASC' },
            }),
            this.dailyScoreRepo.find({
                where: { userId, dayDate: (0, typeorm_2.MoreThanOrEqual)(cutoff) },
                order: { dayDate: 'ASC' },
            }),
            this.dailyMetricRepo.find({
                where: { userId, dayDate: (0, typeorm_2.MoreThanOrEqual)(cutoff) },
                order: { dayDate: 'ASC' },
            }),
            this.baselineRepo.findOne({ where: { userId } }),
            this.sleepPlanRepo.findOne({ where: { userId } }),
            this.journalRepo.find({
                where: { userId, timestamp: (0, typeorm_2.MoreThanOrEqual)(cutoff) },
                order: { timestamp: 'ASC' },
            }),
        ]);
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
            epochTimeline: s.epochTimeline ?? [],
            epochMinutes: s.epochMinutes,
        }));
        const journalFactorEntries = journalEntries.map((j) => ({
            timestamp: j.timestamp,
            factorTag: j.factorTag,
            intensity: j.intensity,
            note: j.note,
        }));
        const typicalRanges = (0, typical_ranges_js_1.computeTypicalRanges)(detectionInterfaces, stageInterfaces, new Date());
        const journalCorrelations = (0, journal_correlations_js_1.journalSleepCorrelations)(journalFactorEntries, stageInterfaces, detectionInterfaces);
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
    async upsertNightFeature(userId, features, nightDate) {
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
        }
        else {
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
    async upsertSleepDetection(userId, detection) {
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
        }
        else {
            const entity = this.sleepDetectionRepo.create({ userId, nightDate, ...data });
            await this.sleepDetectionRepo.save(entity);
        }
    }
    async upsertSleepStage(userId, stage) {
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
            epochTimeline: stage.epochTimeline,
            epochMinutes: stage.epochMinutes,
        };
        if (existing) {
            Object.assign(existing, data);
            await this.sleepStageRepo.save(existing);
        }
        else {
            const entity = this.sleepStageRepo.create({ userId, nightDate, ...data });
            await this.sleepStageRepo.save(entity);
        }
    }
    async upsertDailyScore(userId, score, sleepScore) {
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
        }
        else {
            const entity = this.dailyScoreRepo.create({ userId, dayDate, ...data });
            await this.dailyScoreRepo.save(entity);
        }
    }
    async upsertDailyMetric(userId, metrics, dayDate) {
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
        };
        if (existing) {
            Object.assign(existing, data);
            await this.dailyMetricRepo.save(existing);
        }
        else {
            const entity = this.dailyMetricRepo.create({ userId, dayDate, ...data });
            await this.dailyMetricRepo.save(entity);
        }
    }
    async upsertBaseline(userId, baseline) {
        const existing = await this.baselineRepo.findOne({ where: { userId } });
        if (existing) {
            existing.restingHeartRate = baseline.restingHeartRate;
            existing.rmssd = baseline.rmssd;
            existing.sdnn = baseline.sdnn;
            existing.nightsUsed = baseline.nightsUsed;
            await this.baselineRepo.save(existing);
        }
        else {
            const entity = this.baselineRepo.create({
                userId,
                restingHeartRate: baseline.restingHeartRate,
                rmssd: baseline.rmssd,
                sdnn: baseline.sdnn,
                nightsUsed: baseline.nightsUsed,
            });
            await this.baselineRepo.save(entity);
        }
    }
    deriveSignalSamplesFromSensorRecords(records) {
        return records
            .filter((record) => record.heartRate > 0)
            .map((record) => ({
            timestamp: record.timestamp,
            source: 'strap-history',
            heartRate: record.heartRate,
            ibiMs: record.rrAverageMs != null
                ? record.rrAverageMs
                : 60_000 / Math.max(record.heartRate, 1),
            motionScore: null,
            qualityScore: record.skinContact === false ? 0 : 1,
        }));
    }
    collectReferenceDays(sensorRecords, sleepDetections, nightFeatures) {
        const keys = new Set();
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
    startOfDay(date) {
        const value = new Date(date);
        value.setHours(0, 0, 0, 0);
        return value;
    }
    dayKey(date) {
        return this.startOfDay(date).getTime();
    }
};
exports.PipelineService = PipelineService;
exports.PipelineService = PipelineService = PipelineService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(sleep_detection_entity_js_1.SleepDetection)),
    __param(1, (0, typeorm_1.InjectRepository)(sleep_stage_entity_js_1.SleepStage)),
    __param(2, (0, typeorm_1.InjectRepository)(night_feature_entity_js_1.NightFeature)),
    __param(3, (0, typeorm_1.InjectRepository)(daily_score_entity_js_1.DailyScore)),
    __param(4, (0, typeorm_1.InjectRepository)(daily_metric_entity_js_1.DailyMetric)),
    __param(5, (0, typeorm_1.InjectRepository)(signal_sample_entity_js_1.SignalSample)),
    __param(6, (0, typeorm_1.InjectRepository)(baseline_profile_entity_js_1.BaselineProfile)),
    __param(7, (0, typeorm_1.InjectRepository)(journal_entry_entity_js_1.JournalEntry)),
    __param(8, (0, typeorm_1.InjectRepository)(sleep_plan_entity_js_1.SleepPlan)),
    __param(9, (0, typeorm_1.InjectRepository)(raw_sensor_record_entity_js_1.RawSensorRecord)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], PipelineService);
//# sourceMappingURL=pipeline.service.js.map