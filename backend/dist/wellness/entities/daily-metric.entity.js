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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DailyMetric = void 0;
const typeorm_1 = require("typeorm");
let DailyMetric = class DailyMetric {
    id;
    userId;
    dayDate;
    stressAverage;
    spo2Average;
    skinTempAvgCelsius;
    skinTempDeltaCelsius;
    strainScore;
    sleepConsistencyScore;
    detectedSleepNights;
};
exports.DailyMetric = DailyMetric;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], DailyMetric.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar'),
    __metadata("design:type", String)
], DailyMetric.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)('timestamptz'),
    __metadata("design:type", Date)
], DailyMetric.prototype, "dayDate", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { nullable: true }),
    __metadata("design:type", Number)
], DailyMetric.prototype, "stressAverage", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { nullable: true }),
    __metadata("design:type", Number)
], DailyMetric.prototype, "spo2Average", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { nullable: true }),
    __metadata("design:type", Number)
], DailyMetric.prototype, "skinTempAvgCelsius", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { nullable: true }),
    __metadata("design:type", Number)
], DailyMetric.prototype, "skinTempDeltaCelsius", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { nullable: true }),
    __metadata("design:type", Number)
], DailyMetric.prototype, "strainScore", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { nullable: true }),
    __metadata("design:type", Number)
], DailyMetric.prototype, "sleepConsistencyScore", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { default: 0 }),
    __metadata("design:type", Number)
], DailyMetric.prototype, "detectedSleepNights", void 0);
exports.DailyMetric = DailyMetric = __decorate([
    (0, typeorm_1.Entity)('daily_metrics'),
    (0, typeorm_1.Index)(['userId', 'dayDate'])
], DailyMetric);
//# sourceMappingURL=daily-metric.entity.js.map