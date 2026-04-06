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
exports.ViewsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const journal_entry_entity_js_1 = require("../journal/journal-entry.entity.js");
const baseline_profile_entity_js_1 = require("../plans/baseline-profile.entity.js");
const sleep_plan_entity_js_1 = require("../plans/sleep-plan.entity.js");
const journal_correlations_js_1 = require("../processing/journal-correlations.js");
const sleep_score_js_1 = require("../processing/sleep-score.js");
const typical_ranges_js_1 = require("../processing/typical-ranges.js");
const night_feature_entity_js_1 = require("../sleep/entities/night-feature.entity.js");
const sleep_detection_entity_js_1 = require("../sleep/entities/sleep-detection.entity.js");
const sleep_stage_entity_js_1 = require("../sleep/entities/sleep-stage.entity.js");
const daily_metric_entity_js_1 = require("../wellness/entities/daily-metric.entity.js");
const daily_score_entity_js_1 = require("../wellness/entities/daily-score.entity.js");
const signal_sample_entity_js_1 = require("../wellness/entities/signal-sample.entity.js");
let ViewsService = class ViewsService {
    sleepDetectionRepo;
    sleepStageRepo;
    nightFeatureRepo;
    dailyScoreRepo;
    dailyMetricRepo;
    baselineRepo;
    journalRepo;
    sleepPlanRepo;
    signalSampleRepo;
    constructor(sleepDetectionRepo, sleepStageRepo, nightFeatureRepo, dailyScoreRepo, dailyMetricRepo, baselineRepo, journalRepo, sleepPlanRepo, signalSampleRepo) {
        this.sleepDetectionRepo = sleepDetectionRepo;
        this.sleepStageRepo = sleepStageRepo;
        this.nightFeatureRepo = nightFeatureRepo;
        this.dailyScoreRepo = dailyScoreRepo;
        this.dailyMetricRepo = dailyMetricRepo;
        this.baselineRepo = baselineRepo;
        this.journalRepo = journalRepo;
        this.sleepPlanRepo = sleepPlanRepo;
        this.signalSampleRepo = signalSampleRepo;
    }
    async getHomeView(userId, selectedDateInput) {
        const data = await this.loadDashboardData(userId, selectedDateInput);
        const selectedScore = this.findByDay(data.dailyScores, 'dayDate', data.selectedKey);
        const selectedMetric = this.findByDay(data.dailyMetrics, 'dayDate', data.selectedKey);
        const selectedDetection = this.findSleepByDayOrLatestForToday(data.sleepDetections, 'nightDate', data.selectedKey, data.selectedDate);
        const selectedFeature = this.findSleepByDayOrLatestForToday(data.nightFeatures, 'nightDate', data.selectedKey, data.selectedDate);
        const liveDateLabel = `${this.formatSelectedDateTitle(data.selectedDate)} · ${this.formatSelectedDateSubtitle(data.selectedDate)}`;
        const baselineReady = (data.baselineProfile?.nightsUsed ?? 0) >= 5;
        const sleepAttainmentPercent = this.computeSleepAttainmentPercent(selectedDetection?.durationHours ?? null, data.sleepPlan?.targetSleepMinutes ?? 480);
        const rings = {
            sleep: {
                value: sleepAttainmentPercent == null ? '--' : `${Math.round(sleepAttainmentPercent)}%`,
                progress: this.clamp01((sleepAttainmentPercent ?? 0) / 100),
            },
            recovery: {
                value: selectedScore ? `${selectedScore.dailyBalance}%` : '--',
                progress: this.normalizedPercent(selectedScore?.dailyBalance),
            },
            strain: {
                value: selectedMetric?.strainScore != null
                    ? this.formatDecimal(selectedMetric.strainScore, 2)
                    : '--',
                progress: this.clamp01((selectedMetric?.strainScore ?? 0) / 21),
            },
        };
        const topInsightTitle = selectedScore?.recommendation ?? 'Steady';
        const liveHeartRateValue = '--';
        const liveHeartRateSubtitle = 'Offline';
        return {
            selectedDate: data.selectedKey,
            selectedDateTitle: this.formatSelectedDateTitle(data.selectedDate),
            selectedDateSubtitle: this.formatSelectedDateSubtitle(data.selectedDate),
            topStrip: {
                title: this.formatSelectedDateTitle(data.selectedDate),
                subtitle: this.formatSelectedDateSubtitle(data.selectedDate),
            },
            rings,
            cards: {
                recommendation: {
                    title: topInsightTitle,
                    subtitle: this.formatSelectedDateSubtitle(data.selectedDate),
                    footer: 'Health monitor',
                },
                stress: {
                    title: selectedMetric?.stressAverage != null
                        ? this.formatDecimal(selectedMetric.stressAverage, 2)
                        : '--',
                    subtitle: 'Stress level',
                    footer: 'Stress monitor',
                },
                loadPressure: {
                    title: selectedScore ? `${selectedScore.loadPressure}` : '--',
                    subtitle: 'Load pressure',
                    footer: 'Daily load',
                },
                liveHeartRate: {
                    title: liveHeartRateValue,
                    subtitle: liveHeartRateSubtitle,
                    footer: 'Heart rate',
                },
            },
            todayOverview: {
                headline: this.buildTodayHeadline(selectedScore, baselineReady),
                detail: this.buildTodaySubheadline(selectedScore, data.baselineProfile),
                dailyBalance: selectedScore ? `${selectedScore.dailyBalance}` : '--',
                loadPressure: selectedScore ? `${selectedScore.loadPressure}` : '--',
                sleepReserve: selectedScore
                    ? `${selectedScore.sleepReserveHours >= 0 ? '+' : ''}${selectedScore.sleepReserveHours.toFixed(1)}h`
                    : '--',
                confidence: selectedScore?.confidence ?? 'Low',
                dateLabel: liveDateLabel,
            },
            activities: {
                stress: selectedMetric?.stressAverage != null
                    ? this.formatDecimal(selectedMetric.stressAverage, 2)
                    : '--',
                spo2: selectedMetric?.spo2Average != null
                    ? `${selectedMetric.spo2Average.toFixed(1)}%`
                    : '--',
                skinTemp: selectedMetric?.skinTempAvgCelsius != null
                    ? `${selectedMetric.skinTempAvgCelsius.toFixed(1)}C`
                    : '--',
                strain: selectedMetric?.strainScore != null
                    ? this.formatDecimal(selectedMetric.strainScore, 2)
                    : '--',
                skinTempDelta: selectedMetric?.skinTempDeltaCelsius != null
                    ? `${selectedMetric.skinTempDeltaCelsius >= 0 ? '+' : ''}${selectedMetric.skinTempDeltaCelsius.toFixed(2)}C`
                    : '--',
            },
            confidence: {
                confidence: selectedScore?.confidence ?? 'Low',
                pipelineStatus: this.buildPipelineStatus(data.dailyScores, data.selectedKey),
                sourceBlend: selectedFeature?.sourceBlend ?? 'No data',
                storageMode: 'Local-only storage',
                persistenceHealth: data.dailyScores.length > 0 ? 'Healthy' : 'Unavailable',
                disclaimer: 'Wellness estimates use wearable PPG trends and are not medical or diagnostic outputs.',
            },
            trendSummary: {
                summary: this.buildTrendSummary(data.dailyScores),
                samples: data.dailyScores.map((score) => ({
                    timestamp: score.dayDate.toISOString(),
                    value: score.dailyBalance,
                })),
            },
            stressTrend: data.dailyMetrics
                .filter((metric) => metric.stressAverage != null)
                .map((metric) => ({
                timestamp: metric.dayDate.toISOString(),
                value: metric.stressAverage,
            })),
            strainTrend: data.dailyMetrics
                .filter((metric) => metric.strainScore != null)
                .map((metric) => ({
                timestamp: metric.dayDate.toISOString(),
                value: metric.strainScore,
            })),
            noDataReasons: {
                recovery: 'Readiness requires enough high-quality overnight samples. Run a sync and let baseline warm-up complete.',
                strain: 'Strain appears once the day has enough heart-rate coverage. Keep device connected or import recent history.',
                stress: 'Stress needs RR/IBI windows from clean signal. Sync strap history or provide richer data coverage.',
                loadPressure: 'Load pressure is tied to the daily score pipeline. Run sync/recompute after data ingestion.',
                liveHeartRate: 'Live heart-rate requires an active strap realtime stream.',
                activities: 'Activities summary needs strain or stress data from today.',
            },
        };
    }
    async getSleepView(userId, selectedDateInput) {
        const data = await this.loadDashboardData(userId, selectedDateInput);
        const selectedScore = this.findByDay(data.dailyScores, 'dayDate', data.selectedKey);
        const selectedMetric = this.findByDay(data.dailyMetrics, 'dayDate', data.selectedKey);
        const selectedDetection = this.findSleepByDayOrLatestForToday(data.sleepDetections, 'nightDate', data.selectedKey, data.selectedDate);
        const selectedStage = this.findSleepByDayOrLatestForToday(data.sleepStages, 'nightDate', data.selectedKey, data.selectedDate);
        const selectedFeature = this.findSleepByDayOrLatestForToday(data.nightFeatures, 'nightDate', data.selectedKey, data.selectedDate);
        const detectionInterfaces = data.sleepDetections.map((d) => this.toDetectionSummary(d));
        const stageInterfaces = data.sleepStages.map((s) => this.toStageSummary(s));
        const typicalRanges = (0, typical_ranges_js_1.computeTypicalRanges)(detectionInterfaces, stageInterfaces, data.selectedDate);
        const journalEntries = data.journalEntries.map((entry) => ({
            timestamp: entry.timestamp,
            factorTag: entry.factorTag,
            intensity: entry.intensity,
            note: entry.note,
        }));
        const factorInsights = (0, journal_correlations_js_1.journalSleepCorrelations)(journalEntries, stageInterfaces, detectionInterfaces);
        const signalSamples = selectedDetection == null
            ? []
            : await this.signalSampleRepo.find({
                where: {
                    userId,
                    timestamp: (0, typeorm_2.Between)(selectedDetection.bedtime, selectedDetection.wakeTime),
                },
                order: { timestamp: 'ASC' },
            });
        const selectedDetectionSummary = selectedDetection
            ? this.toDetectionSummary(selectedDetection)
            : null;
        const selectedStageSummary = selectedStage ? this.toStageSummary(selectedStage) : null;
        const selectedDurationHours = selectedDetectionSummary?.durationHours ?? null;
        const restorativeMinutes = selectedStageSummary
            ? selectedStageSummary.deepMinutes + selectedStageSummary.remMinutes
            : null;
        const durationVsTypical = selectedDurationHours == null || typicalRanges == null
            ? ''
            : this.formatTypicalHoursDelta(selectedDurationHours, typicalRanges.typicalDurationMinutes / 60);
        const restorativeVsTypical = restorativeMinutes == null || typicalRanges == null
            ? ''
            : this.formatTypicalMinutesDelta(restorativeMinutes, typicalRanges.typicalRestorativeMinutes);
        const sleepScoreTrend = data.sleepDetections
            .slice(-7)
            .map((detection) => {
            const matchingStage = this.findByDay(data.sleepStages, 'nightDate', this.dayKey(detection.nightDate));
            const matchingFeature = this.findByDay(data.nightFeatures, 'nightDate', this.dayKey(detection.nightDate));
            const score = (0, sleep_score_js_1.computeSleepScoreForNight)(detection.durationHours, data.sleepPlan?.targetSleepMinutes ?? 480, matchingStage ? this.toStageSummary(matchingStage) : null, this.toDetectionSummary(detection), matchingFeature
                ? {
                    nightDate: matchingFeature.nightDate,
                    restingHeartRate: matchingFeature.restingHeartRate,
                    rmssd: matchingFeature.rmssd,
                    sdnn: matchingFeature.sdnn,
                    respiratoryRate: matchingFeature.respiratoryRate,
                    continuity: matchingFeature.continuity,
                    regularity: matchingFeature.regularity,
                    validCoverage: matchingFeature.validCoverage,
                    confidenceRaw: matchingFeature.confidenceRaw,
                    sleepEstimateHours: matchingFeature.sleepEstimateHours,
                    sourceBlend: matchingFeature.sourceBlend,
                }
                : null, {
                restingHeartRate: data.baselineProfile?.restingHeartRate ?? 0,
                rmssd: data.baselineProfile?.rmssd ?? 0,
                sdnn: data.baselineProfile?.sdnn ?? 0,
                nightsUsed: data.baselineProfile?.nightsUsed ?? 0,
                isWarmedUp: (data.baselineProfile?.nightsUsed ?? 0) >= 5,
            });
            return score == null
                ? null
                : {
                    timestamp: detection.nightDate.toISOString(),
                    value: score,
                };
        })
            .filter(Boolean);
        return {
            selectedDate: data.selectedKey,
            selectedDateTitle: this.formatSelectedDateTitle(data.selectedDate),
            selectedDateSubtitle: this.formatSelectedDateSubtitle(data.selectedDate),
            emptyState: {
                isEmpty: selectedDetectionSummary == null,
                title: 'No sleep data yet',
                subtitle: 'Wear your strap tonight to see your first sleep breakdown.',
                support: 'Enable Health access for additional sleep data.',
            },
            header: {
                bedtime: selectedDetectionSummary == null
                    ? '--'
                    : this.formatTimeOnly(selectedDetectionSummary.bedtime),
                wakeTime: selectedDetectionSummary == null
                    ? '--'
                    : this.formatTimeOnly(selectedDetectionSummary.wakeTime),
                duration: selectedDurationHours == null
                    ? '--'
                    : this.formatDurationHours(selectedDurationHours),
                restorative: restorativeMinutes == null
                    ? '--'
                    : this.formatMinutes(restorativeMinutes),
                timeInBed: selectedDetectionSummary == null
                    ? '--'
                    : this.formatMinutes(Math.max(0, Math.round((selectedDetectionSummary.wakeTime.getTime() -
                        selectedDetectionSummary.bedtime.getTime()) /
                        60000))),
                durationVsTypical,
                restorativeVsTypical,
            },
            sleepInsight: this.buildSleepInsight(selectedDurationHours, selectedStageSummary, typicalRanges),
            hrChart: {
                samples: signalSamples
                    .filter((sample) => sample.heartRate != null)
                    .map((sample) => ({
                    timestamp: sample.timestamp.toISOString(),
                    value: sample.heartRate,
                })),
            },
            stageRows: this.buildSleepStageRows(selectedStageSummary, typicalRanges),
            epochTimeline: (selectedStageSummary?.epochTimeline ?? []).map((epoch) => ({
                timestamp: epoch.timestamp.toISOString(),
                stage: epoch.stage,
            })),
            durationTrend: {
                targetHours: (data.sleepPlan?.targetSleepMinutes ?? 480) / 60,
                samples: data.sleepDetections.slice(-7).map((detection) => ({
                    timestamp: detection.nightDate.toISOString(),
                    value: detection.durationHours,
                })),
            },
            sleepScoreTrend,
            metrics: this.buildSleepMetrics(selectedScore, selectedMetric, selectedDetectionSummary, selectedFeature, data.baselineProfile, data.sleepPlan, selectedStageSummary),
            factorInsights: factorInsights.map((correlation) => ({
                factorTag: correlation.factorTag,
                deepDelta: Math.abs(correlation.avgDeepDelta) > 2
                    ? `${correlation.avgDeepDelta > 0 ? '+' : ''}${Math.round(correlation.avgDeepDelta)}m deep`
                    : null,
                remDelta: Math.abs(correlation.avgRemDelta) > 2
                    ? `${correlation.avgRemDelta > 0 ? '+' : ''}${Math.round(correlation.avgRemDelta)}m REM`
                    : null,
                sampleCount: correlation.sampleCount,
            })),
            planner: {
                targetSleepMinutes: data.sleepPlan?.targetSleepMinutes ?? 480,
                wakeMinutes: data.sleepPlan?.wakeMinutes ?? 420,
                alarmEnabled: data.sleepPlan?.alarmEnabled ?? false,
                alarmMinutes: data.sleepPlan?.alarmMinutes ?? 420,
                smartWakeEnabled: data.sleepPlan?.smartWakeEnabled ?? false,
                alarmStatusText: this.buildAlarmStatusText(data.sleepPlan),
                sleepReserveText: selectedScore == null
                    ? '--'
                    : `${selectedScore.sleepReserveHours >= 0 ? '+' : ''}${selectedScore.sleepReserveHours.toFixed(1)}h`,
                estimatedSleepHours: selectedFeature?.sleepEstimateHours != null
                    ? `${selectedFeature.sleepEstimateHours.toFixed(1)} h`
                    : '--',
                smartWakeStatusText: this.buildSmartWakeStatusText(data.sleepPlan, selectedStageSummary),
            },
            confidence: {
                confidence: selectedScore?.confidence ?? 'Low',
                pipelineStatus: this.buildPipelineStatus(data.dailyScores, data.selectedKey),
                sourceBlend: selectedFeature?.sourceBlend ?? 'No data',
                storageMode: 'Local-only storage',
                persistenceHealth: data.dailyScores.length > 0 ? 'Healthy' : 'Unavailable',
                disclaimer: 'Wellness estimates use wearable PPG trends and are not medical or diagnostic outputs.',
            },
        };
    }
    async updateSleepPlan(userId, dto) {
        const existing = await this.sleepPlanRepo.findOne({ where: { userId } });
        const entity = existing ?? this.sleepPlanRepo.create({ userId });
        entity.targetSleepMinutes = dto.targetSleepMinutes;
        entity.wakeMinutes = dto.wakeMinutes;
        entity.alarmEnabled = dto.alarmEnabled;
        entity.alarmMinutes = dto.alarmMinutes;
        entity.smartWakeEnabled = dto.smartWakeEnabled;
        await this.sleepPlanRepo.save(entity);
        return {
            ok: true,
            sleepView: await this.getSleepView(userId),
        };
    }
    async loadDashboardData(userId, selectedDateInput) {
        const selectedDate = this.resolveSelectedDate(selectedDateInput);
        const selectedKey = this.dayKey(selectedDate);
        const cutoff = new Date(selectedDate.getTime() - 45 * 24 * 60 * 60 * 1000);
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
        return {
            selectedDate,
            selectedKey,
            nightFeatures,
            sleepDetections,
            sleepStages,
            dailyScores,
            dailyMetrics,
            baselineProfile,
            sleepPlan,
            journalEntries,
        };
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
    findByDay(items, key, selectedKey) {
        return items.find((item) => this.dayKey(item[key]) === selectedKey) ?? null;
    }
    findSleepByDayOrLatestForToday(items, key, selectedKey, selectedDate) {
        const exact = this.findByDay(items, key, selectedKey);
        if (exact)
            return exact;
        if (this.isToday(selectedDate)) {
            return items.length > 0 ? items[items.length - 1] : null;
        }
        return null;
    }
    formatSelectedDateTitle(date) {
        const now = new Date();
        const todayKey = this.dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0));
        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0, 0);
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0, 0);
        const key = this.dayKey(date);
        if (key === todayKey)
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
    isToday(date) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
        return this.dayKey(date) === this.dayKey(today);
    }
    formatSelectedDateSubtitle(date) {
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        }).format(date);
    }
    normalizedPercent(value) {
        return this.clamp01((value ?? 0) / 100);
    }
    clamp01(value) {
        return Math.max(0, Math.min(1, value));
    }
    computeSleepAttainmentPercent(durationHours, targetSleepMinutes) {
        if (durationHours == null)
            return null;
        return Math.max(0, Math.min(100, (durationHours / (targetSleepMinutes / 60)) * 100));
    }
    buildTodayHeadline(selectedScore, baselineReady) {
        if (!selectedScore)
            return 'Not enough high-quality signal yet';
        if (selectedScore.confidence === 'Low')
            return 'Insufficient high-quality signal';
        if (!baselineReady)
            return 'Building your personal baseline';
        if (selectedScore.recommendation === 'Restore')
            return 'Prioritize recovery';
        if (selectedScore.recommendation === 'Build')
            return 'You can push a bit more';
        return 'A balanced day is best';
    }
    buildTodaySubheadline(selectedScore, baselineProfile) {
        if (!selectedScore) {
            return 'Connect your strap and sync to generate this day\'s score.';
        }
        if ((baselineProfile?.nightsUsed ?? 0) < 5) {
            const remaining = Math.max(0, 5 - (baselineProfile?.nightsUsed ?? 0));
            return `Baseline warm-up in progress. ${remaining} more high-quality night(s) needed for stable trends.`;
        }
        return `Daily Balance ${selectedScore.dailyBalance} · Load Pressure ${selectedScore.loadPressure} · Sleep Reserve ${selectedScore.sleepReserveHours.toFixed(1)}h`;
    }
    buildTrendSummary(scores) {
        if (scores.length < 2)
            return 'Need at least 2 days of data to build a trend.';
        const first = scores[0];
        const last = scores[scores.length - 1];
        const delta = last.dailyBalance - first.dailyBalance;
        const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
        return `Daily Balance is ${direction} by ${Math.abs(delta)} points over this window.`;
    }
    buildPipelineStatus(scores, selectedKey) {
        if (scores.length === 0)
            return 'Waiting for first sync';
        const hasSelected = scores.some((score) => this.dayKey(score.dayDate) === selectedKey);
        return hasSelected ? 'Selected day is derived from stored pipeline results.' : 'Latest pipeline results are available.';
    }
    toDetectionSummary(detection) {
        return {
            nightDate: detection.nightDate,
            bedtime: detection.bedtime,
            wakeTime: detection.wakeTime,
            durationHours: detection.durationHours,
            interruptionCount: detection.interruptionCount,
            continuity: detection.continuity,
            regularity: detection.regularity,
            validCoverage: detection.validCoverage,
            confidence: detection.confidence,
        };
    }
    toStageSummary(stage) {
        return {
            nightDate: stage.nightDate,
            remMinutes: stage.remMinutes,
            coreMinutes: stage.coreMinutes,
            deepMinutes: stage.deepMinutes,
            awakeMinutes: stage.awakeMinutes,
            unknownMinutes: stage.unknownMinutes,
            confidence: stage.confidence,
            source: stage.source,
            epochTimeline: (stage.epochTimeline ?? []).map((epoch) => ({
                timestamp: new Date(epoch.timestamp),
                stage: epoch.stage,
            })),
            epochMinutes: stage.epochMinutes,
        };
    }
    formatDurationHours(hours) {
        const totalMinutes = Math.round(hours * 60);
        return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, '0')}`;
    }
    formatMinutes(minutes) {
        return `${Math.floor(minutes / 60)}:${String(Math.round(minutes % 60)).padStart(2, '0')}`;
    }
    formatTimeOnly(date) {
        return new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        }).format(date);
    }
    formatTypicalHoursDelta(currentHours, typicalHours) {
        const totalTypicalMinutes = Math.round(typicalHours * 60);
        const arrow = currentHours >= typicalHours ? '▲' : '▼';
        return `${arrow} ${Math.floor(totalTypicalMinutes / 60)}:${String(totalTypicalMinutes % 60).padStart(2, '0')}`;
    }
    formatTypicalMinutesDelta(currentMinutes, typicalMinutes) {
        const roundedTypical = Math.round(typicalMinutes);
        const arrow = currentMinutes >= roundedTypical ? '▲' : '▼';
        return `${arrow} ${Math.floor(roundedTypical / 60)}:${String(roundedTypical % 60).padStart(2, '0')}`;
    }
    buildSleepStageRows(selectedStage, typicalRanges) {
        if (!selectedStage)
            return [];
        const totalMinutes = selectedStage.remMinutes +
            selectedStage.coreMinutes +
            selectedStage.deepMinutes +
            selectedStage.awakeMinutes +
            selectedStage.unknownMinutes;
        if (totalMinutes <= 0)
            return [];
        const makeRow = (id, label, minutes, color, typicalRange) => {
            const percent = Math.round((minutes / totalMinutes) * 100);
            return {
                id,
                label,
                percent,
                durationFormatted: this.formatMinutes(minutes),
                color,
                barFraction: percent / 100,
                typicalRange: typicalRange == null
                    ? null
                    : {
                        lower: typicalRange.lower,
                        upper: typicalRange.upper,
                    },
            };
        };
        return [
            makeRow('awake', 'AWAKE', selectedStage.awakeMinutes, '#888888', typicalRanges?.typicalAwakePercent),
            makeRow('light', 'LIGHT', selectedStage.coreMinutes, '#8066E6', typicalRanges?.typicalLightPercent),
            makeRow('deep', 'SWS (DEEP)', selectedStage.deepMinutes, '#D94D80', typicalRanges?.typicalDeepPercent),
            makeRow('rem', 'REM', selectedStage.remMinutes, '#B333CC', typicalRanges?.typicalRemPercent),
        ];
    }
    buildSleepInsight(selectedDurationHours, selectedStage, typicalRanges) {
        if (!selectedStage)
            return null;
        const total = selectedStage.remMinutes + selectedStage.coreMinutes + selectedStage.deepMinutes + selectedStage.awakeMinutes + selectedStage.unknownMinutes;
        if (total <= 0)
            return null;
        const remPct = (selectedStage.remMinutes / total) * 100;
        const deepPct = (selectedStage.deepMinutes / total) * 100;
        const awakePct = (selectedStage.awakeMinutes / total) * 100;
        if (remPct > 28) {
            return `${Math.round(remPct)}% of your time in bed was spent in REM sleep. This might indicate your body is making up for recent REM debt.`;
        }
        if (deepPct < 10 && typicalRanges && typicalRanges.typicalDeepPercent.lower > 12) {
            return 'Your deep sleep was below your typical range. Alcohol, late meals, or high stress can reduce deep sleep.';
        }
        if (awakePct > 10) {
            return `You were awake for ${Math.round(awakePct)}% of your time in bed. High wake time may indicate restlessness or disruptions.`;
        }
        if (selectedDurationHours != null && typicalRanges) {
            const typicalHours = typicalRanges.typicalDurationMinutes / 60;
            if (selectedDurationHours < typicalHours - 0.5) {
                const diffMinutes = Math.round((typicalHours - selectedDurationHours) * 60);
                return `You slept ${Math.floor(diffMinutes / 60)}h ${diffMinutes % 60}m less than your typical duration. Consistent sleep duration supports recovery.`;
            }
        }
        if (remPct >= 15 && remPct <= 25 && deepPct >= 10 && deepPct <= 25) {
            return 'Your sleep stages were within healthy ranges. Consistency like this supports long-term recovery.';
        }
        return null;
    }
    buildSleepMetrics(selectedScore, selectedMetric, selectedDetection, selectedFeature, baselineProfile, sleepPlan, selectedStage) {
        const timeInBedMinutes = selectedDetection == null
            ? null
            : Math.max(0, (selectedDetection.wakeTime.getTime() - selectedDetection.bedtime.getTime()) / 60000);
        const efficiency = selectedDetection == null || !timeInBedMinutes
            ? null
            : Math.min(100, (selectedDetection.durationHours * 60 * 100) / timeInBedMinutes);
        const sleepScore = selectedDetection == null
            ? null
            : (0, sleep_score_js_1.computeSleepScoreForNight)(selectedDetection.durationHours, sleepPlan?.targetSleepMinutes ?? 480, selectedStage, selectedDetection, selectedFeature == null
                ? null
                : {
                    nightDate: selectedFeature.nightDate,
                    restingHeartRate: selectedFeature.restingHeartRate,
                    rmssd: selectedFeature.rmssd,
                    sdnn: selectedFeature.sdnn,
                    respiratoryRate: selectedFeature.respiratoryRate,
                    continuity: selectedFeature.continuity,
                    regularity: selectedFeature.regularity,
                    validCoverage: selectedFeature.validCoverage,
                    confidenceRaw: selectedFeature.confidenceRaw,
                    sleepEstimateHours: selectedFeature.sleepEstimateHours,
                    sourceBlend: selectedFeature.sourceBlend,
                }, {
                restingHeartRate: baselineProfile?.restingHeartRate ?? 0,
                rmssd: baselineProfile?.rmssd ?? 0,
                sdnn: baselineProfile?.sdnn ?? 0,
                nightsUsed: baselineProfile?.nightsUsed ?? 0,
                isWarmedUp: (baselineProfile?.nightsUsed ?? 0) >= 5,
            });
        return [
            {
                label: 'Recovery',
                value: selectedScore ? `${selectedScore.dailyBalance}%` : '--',
                detail: selectedScore?.recommendation ?? null,
            },
            {
                label: 'Sleep Reserve',
                value: selectedScore == null
                    ? '--'
                    : `${selectedScore.sleepReserveHours >= 0 ? '+' : ''}${selectedScore.sleepReserveHours.toFixed(1)}h`,
                detail: null,
            },
            {
                label: 'Efficiency',
                value: efficiency == null ? '--' : `${Math.round(efficiency)}%`,
                detail: null,
            },
            {
                label: 'Interruptions',
                value: selectedDetection == null ? '--' : `${selectedDetection.interruptionCount}`,
                detail: null,
            },
            {
                label: 'Sleep Score',
                value: sleepScore == null ? '--' : `${sleepScore}`,
                detail: '/ 100',
            },
            {
                label: 'Resting HR',
                value: selectedFeature == null ? '--' : `${Math.round(selectedFeature.restingHeartRate)} bpm`,
                detail: selectedFeature == null || baselineProfile == null || baselineProfile.nightsUsed < 5
                    ? null
                    : `${selectedFeature.restingHeartRate - baselineProfile.restingHeartRate >= 0 ? '+' : ''}${Math.round(selectedFeature.restingHeartRate - baselineProfile.restingHeartRate)}`,
            },
            {
                label: 'HRV (RMSSD)',
                value: selectedFeature == null ? '--' : `${Math.round(selectedFeature.rmssd)} ms`,
                detail: selectedFeature == null || baselineProfile == null || baselineProfile.nightsUsed < 5
                    ? null
                    : `${selectedFeature.rmssd - baselineProfile.rmssd >= 0 ? '+' : ''}${Math.round(selectedFeature.rmssd - baselineProfile.rmssd)}`,
            },
            {
                label: 'Respiratory Rate',
                value: selectedFeature == null ? '--' : `${selectedFeature.respiratoryRate.toFixed(1)} rpm`,
                detail: null,
            },
            {
                label: 'Consistency',
                value: selectedMetric?.sleepConsistencyScore != null
                    ? `${Math.round(selectedMetric.sleepConsistencyScore)}`
                    : '--',
                detail: '/ 100',
            },
        ];
    }
    buildAlarmStatusText(sleepPlan) {
        if (!sleepPlan?.alarmEnabled)
            return 'Alarm disabled';
        return `Enabled for ${this.formatMinutesAsTime(sleepPlan.alarmMinutes)} (not armed)`;
    }
    buildSmartWakeStatusText(sleepPlan, selectedStage) {
        if (!sleepPlan?.smartWakeEnabled)
            return '';
        if (!selectedStage?.epochTimeline?.length)
            return 'Smart wake: need more data';
        const latest = this.nextAlarmDate(sleepPlan.alarmMinutes);
        const earliest = new Date(latest.getTime() - 20 * 60 * 1000);
        return `Smart wake: ${this.formatTimeOnly(earliest)}-${this.formatTimeOnly(latest)}`;
    }
    nextAlarmDate(alarmMinutes) {
        const now = new Date();
        const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(alarmMinutes / 60), alarmMinutes % 60, 0, 0);
        return next > now ? next : new Date(next.getTime() + 24 * 60 * 60 * 1000);
    }
    formatMinutesAsTime(totalMinutes) {
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        const base = new Date(2026, 0, 1, hours, minutes, 0, 0);
        return this.formatTimeOnly(base);
    }
    formatDecimal(value, precision) {
        return value.toFixed(precision);
    }
};
exports.ViewsService = ViewsService;
exports.ViewsService = ViewsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(sleep_detection_entity_js_1.SleepDetection)),
    __param(1, (0, typeorm_1.InjectRepository)(sleep_stage_entity_js_1.SleepStage)),
    __param(2, (0, typeorm_1.InjectRepository)(night_feature_entity_js_1.NightFeature)),
    __param(3, (0, typeorm_1.InjectRepository)(daily_score_entity_js_1.DailyScore)),
    __param(4, (0, typeorm_1.InjectRepository)(daily_metric_entity_js_1.DailyMetric)),
    __param(5, (0, typeorm_1.InjectRepository)(baseline_profile_entity_js_1.BaselineProfile)),
    __param(6, (0, typeorm_1.InjectRepository)(journal_entry_entity_js_1.JournalEntry)),
    __param(7, (0, typeorm_1.InjectRepository)(sleep_plan_entity_js_1.SleepPlan)),
    __param(8, (0, typeorm_1.InjectRepository)(signal_sample_entity_js_1.SignalSample)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], ViewsService);
//# sourceMappingURL=views.service.js.map