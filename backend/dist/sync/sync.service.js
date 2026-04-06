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
exports.SyncService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const sleep_detection_entity_js_1 = require("../sleep/entities/sleep-detection.entity.js");
const sleep_stage_entity_js_1 = require("../sleep/entities/sleep-stage.entity.js");
const night_feature_entity_js_1 = require("../sleep/entities/night-feature.entity.js");
const daily_score_entity_js_1 = require("../wellness/entities/daily-score.entity.js");
const daily_metric_entity_js_1 = require("../wellness/entities/daily-metric.entity.js");
const signal_sample_entity_js_1 = require("../wellness/entities/signal-sample.entity.js");
const journal_entry_entity_js_1 = require("../journal/journal-entry.entity.js");
const sleep_plan_entity_js_1 = require("../plans/sleep-plan.entity.js");
const baseline_profile_entity_js_1 = require("../plans/baseline-profile.entity.js");
let SyncService = class SyncService {
    sleepDetectionRepo;
    sleepStageRepo;
    nightFeatureRepo;
    dailyScoreRepo;
    dailyMetricRepo;
    signalSampleRepo;
    journalEntryRepo;
    sleepPlanRepo;
    baselineProfileRepo;
    constructor(sleepDetectionRepo, sleepStageRepo, nightFeatureRepo, dailyScoreRepo, dailyMetricRepo, signalSampleRepo, journalEntryRepo, sleepPlanRepo, baselineProfileRepo) {
        this.sleepDetectionRepo = sleepDetectionRepo;
        this.sleepStageRepo = sleepStageRepo;
        this.nightFeatureRepo = nightFeatureRepo;
        this.dailyScoreRepo = dailyScoreRepo;
        this.dailyMetricRepo = dailyMetricRepo;
        this.signalSampleRepo = signalSampleRepo;
        this.journalEntryRepo = journalEntryRepo;
        this.sleepPlanRepo = sleepPlanRepo;
        this.baselineProfileRepo = baselineProfileRepo;
    }
    async push(userId, dto) {
        const counts = {};
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
    async pull(userId) {
        const [nightFeatures, sleepDetections, sleepStages, dailyScores, dailyMetrics, journalEntries, sleepPlan, baselineProfile,] = await Promise.all([
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
};
exports.SyncService = SyncService;
exports.SyncService = SyncService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(sleep_detection_entity_js_1.SleepDetection)),
    __param(1, (0, typeorm_1.InjectRepository)(sleep_stage_entity_js_1.SleepStage)),
    __param(2, (0, typeorm_1.InjectRepository)(night_feature_entity_js_1.NightFeature)),
    __param(3, (0, typeorm_1.InjectRepository)(daily_score_entity_js_1.DailyScore)),
    __param(4, (0, typeorm_1.InjectRepository)(daily_metric_entity_js_1.DailyMetric)),
    __param(5, (0, typeorm_1.InjectRepository)(signal_sample_entity_js_1.SignalSample)),
    __param(6, (0, typeorm_1.InjectRepository)(journal_entry_entity_js_1.JournalEntry)),
    __param(7, (0, typeorm_1.InjectRepository)(sleep_plan_entity_js_1.SleepPlan)),
    __param(8, (0, typeorm_1.InjectRepository)(baseline_profile_entity_js_1.BaselineProfile)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], SyncService);
//# sourceMappingURL=sync.service.js.map