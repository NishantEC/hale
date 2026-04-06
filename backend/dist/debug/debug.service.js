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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebugService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const pipeline_service_js_1 = require("../pipeline/pipeline.service.js");
const raw_sensor_record_entity_js_1 = require("../pipeline/entities/raw-sensor-record.entity.js");
const sleep_detection_entity_js_1 = require("../sleep/entities/sleep-detection.entity.js");
const sleep_stage_entity_js_1 = require("../sleep/entities/sleep-stage.entity.js");
const night_feature_entity_js_1 = require("../sleep/entities/night-feature.entity.js");
const daily_score_entity_js_1 = require("../wellness/entities/daily-score.entity.js");
const daily_metric_entity_js_1 = require("../wellness/entities/daily-metric.entity.js");
const sleep_plan_entity_js_1 = require("../plans/sleep-plan.entity.js");
const views_service_js_1 = require("../views/views.service.js");
let DebugService = class DebugService {
    pipelineService;
    viewsService;
    rawSensorRepo;
    sleepDetectionRepo;
    sleepStageRepo;
    nightFeatureRepo;
    dailyScoreRepo;
    dailyMetricRepo;
    sleepPlanRepo;
    enabled = process.env.DEBUG_INSPECTOR_ENABLED === 'true' ||
        (process.env.DEBUG_INSPECTOR_ENABLED == null && process.env.NODE_ENV !== 'production');
    constructor(pipelineService, viewsService, rawSensorRepo, sleepDetectionRepo, sleepStageRepo, nightFeatureRepo, dailyScoreRepo, dailyMetricRepo, sleepPlanRepo) {
        this.pipelineService = pipelineService;
        this.viewsService = viewsService;
        this.rawSensorRepo = rawSensorRepo;
        this.sleepDetectionRepo = sleepDetectionRepo;
        this.sleepStageRepo = sleepStageRepo;
        this.nightFeatureRepo = nightFeatureRepo;
        this.dailyScoreRepo = dailyScoreRepo;
        this.dailyMetricRepo = dailyMetricRepo;
        this.sleepPlanRepo = sleepPlanRepo;
    }
    assertEnabled() {
        if (!this.enabled) {
            throw new common_1.NotFoundException();
        }
    }
    async getOverview(userId, dateInput) {
        this.assertEnabled();
        const selectedDate = this.resolveSelectedDate(dateInput);
        const selectedKey = this.dayKey(selectedDate);
        const cutoff = new Date(selectedDate.getTime() - 45 * 24 * 60 * 60 * 1000);
        const { start, end } = this.localDayBounds(selectedDate);
        const [rawRecordCount, sleepDetectionCount, sleepStageCount, dailyScoreCount, dailyMetricCount, earliestRaw, latestRaw, selectedDayRawRecordCount, recentDetections, recentStages, recentFeatures, latestSleepPlan, homeView, sleepView,] = await Promise.all([
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
                where: { userId, nightDate: (0, typeorm_2.MoreThanOrEqual)(cutoff) },
                order: { nightDate: 'ASC' },
            }),
            this.sleepStageRepo.find({
                where: { userId, nightDate: (0, typeorm_2.MoreThanOrEqual)(cutoff) },
                order: { nightDate: 'ASC' },
            }),
            this.nightFeatureRepo.find({
                where: { userId, nightDate: (0, typeorm_2.MoreThanOrEqual)(cutoff) },
                order: { nightDate: 'ASC' },
            }),
            this.sleepPlanRepo.findOne({ where: { userId } }),
            this.viewsService.getHomeView(userId, selectedKey),
            this.viewsService.getSleepView(userId, selectedKey),
        ]);
        const detectionSelection = this.selectByDayOrLatestForToday(recentDetections, 'nightDate', selectedKey, selectedDate);
        const stageSelection = this.selectByDayOrLatestForToday(recentStages, 'nightDate', selectedKey, selectedDate);
        const featureSelection = this.selectByDayOrLatestForToday(recentFeatures, 'nightDate', selectedKey, selectedDate);
        const selectionMode = this.pickSelectionMode(detectionSelection, stageSelection, featureSelection);
        const selectedNightDate = detectionSelection.item?.nightDate ??
            stageSelection.item?.nightDate ??
            featureSelection.item?.nightDate ??
            null;
        const epochTimelineCount = Array.isArray(stageSelection.item?.epochTimeline)
            ? stageSelection.item.epochTimeline.length
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
            lastPipelineRunStatus: dailyScoreCount > 0 ? 'storedResultsAvailable' : 'noStoredResultsYet',
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
    async getRawRecords(userId, dateInput, limit = 200) {
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
    async getSleepNight(userId, dateInput) {
        this.assertEnabled();
        const selectedDate = this.resolveSelectedDate(dateInput);
        const selectedKey = this.dayKey(selectedDate);
        const cutoff = new Date(selectedDate.getTime() - 45 * 24 * 60 * 60 * 1000);
        const [detections, stages, features] = await Promise.all([
            this.sleepDetectionRepo.find({
                where: { userId, nightDate: (0, typeorm_2.MoreThanOrEqual)(cutoff) },
                order: { nightDate: 'ASC' },
            }),
            this.sleepStageRepo.find({
                where: { userId, nightDate: (0, typeorm_2.MoreThanOrEqual)(cutoff) },
                order: { nightDate: 'ASC' },
            }),
            this.nightFeatureRepo.find({
                where: { userId, nightDate: (0, typeorm_2.MoreThanOrEqual)(cutoff) },
                order: { nightDate: 'ASC' },
            }),
        ]);
        const detectionSelection = this.selectByDayOrLatestForToday(detections, 'nightDate', selectedKey, selectedDate);
        const stageSelection = this.selectByDayOrLatestForToday(stages, 'nightDate', selectedKey, selectedDate);
        const featureSelection = this.selectByDayOrLatestForToday(features, 'nightDate', selectedKey, selectedDate);
        const detection = detectionSelection.item;
        const stage = stageSelection.item;
        const feature = featureSelection.item;
        const selectionMode = this.pickSelectionMode(detectionSelection, stageSelection, featureSelection);
        const epochTimeline = Array.isArray(stage?.epochTimeline) ? stage.epochTimeline : [];
        return {
            selectedDate: selectedKey,
            selectedNightDate: detection?.nightDate?.toISOString() ??
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
    async getPipelineResults(userId) {
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
    async runPipeline(userId, dateInput) {
        this.assertEnabled();
        const runResult = await this.pipelineService.runPipeline(userId);
        const overview = await this.getOverview(userId, dateInput);
        return { runResult, overview };
    }
    async recomputeViews(userId, dateInput) {
        this.assertEnabled();
        const selectedDate = this.dayKey(this.resolveSelectedDate(dateInput));
        const [homeView, sleepView, overview] = await Promise.all([
            this.viewsService.getHomeView(userId, selectedDate),
            this.viewsService.getSleepView(userId, selectedDate),
            this.getOverview(userId, selectedDate),
        ]);
        return { selectedDate, homeView, sleepView, overview };
    }
    resolveSelectedDate(dateInput) {
        if (dateInput && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
            const [year, month, day] = dateInput.split('-').map(Number);
            return new Date(year, month - 1, day, 12, 0, 0, 0);
        }
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
    }
    dayKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    localDayBounds(date) {
        const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        return { start, end };
    }
    isToday(date) {
        const now = new Date();
        return this.dayKey(date) === this.dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0));
    }
    selectByDayOrLatestForToday(items, key, selectedKey, selectedDate) {
        const exact = items.find((item) => this.dayKey(item[key]) === selectedKey) ?? null;
        if (exact)
            return { item: exact, mode: 'exactMatch' };
        if (this.isToday(selectedDate) && items.length > 0) {
            return {
                item: items[items.length - 1],
                mode: 'fallbackToLatestCompletedNight',
            };
        }
        return { item: null, mode: 'noNightAvailable' };
    }
    pickSelectionMode(detectionSelection, stageSelection, featureSelection) {
        if (detectionSelection.item)
            return detectionSelection.mode;
        if (stageSelection.item)
            return stageSelection.mode;
        if (featureSelection.item)
            return featureSelection.mode;
        return 'noNightAvailable';
    }
    selectionReason(mode) {
        switch (mode) {
            case 'exactMatch':
                return 'Selected date resolved to a matching stored night.';
            case 'fallbackToLatestCompletedNight':
                return 'No exact match for the selected date, so the latest completed stored night was used.';
            default:
                return 'No sleep night is available for the selected date window.';
        }
    }
    formatSelectedDateTitle(date) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0, 0);
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0, 0);
        const key = this.dayKey(date);
        if (key === this.dayKey(today))
            return 'Today';
        if (key === this.dayKey(yesterday))
            return 'Yesterday';
        if (key === this.dayKey(tomorrow))
            return 'Tomorrow';
        return new Intl.DateTimeFormat('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
        }).format(date);
    }
    formatSelectedDateSubtitle(date) {
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        }).format(date);
    }
};
exports.DebugService = DebugService;
exports.DebugService = DebugService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, typeorm_1.InjectRepository)(raw_sensor_record_entity_js_1.RawSensorRecord)),
    __param(3, (0, typeorm_1.InjectRepository)(sleep_detection_entity_js_1.SleepDetection)),
    __param(4, (0, typeorm_1.InjectRepository)(sleep_stage_entity_js_1.SleepStage)),
    __param(5, (0, typeorm_1.InjectRepository)(night_feature_entity_js_1.NightFeature)),
    __param(6, (0, typeorm_1.InjectRepository)(daily_score_entity_js_1.DailyScore)),
    __param(7, (0, typeorm_1.InjectRepository)(daily_metric_entity_js_1.DailyMetric)),
    __param(8, (0, typeorm_1.InjectRepository)(sleep_plan_entity_js_1.SleepPlan)),
    __metadata("design:paramtypes", [pipeline_service_js_1.PipelineService,
        views_service_js_1.ViewsService,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], DebugService);
//# sourceMappingURL=debug.service.js.map