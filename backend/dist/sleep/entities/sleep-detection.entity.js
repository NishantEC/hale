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
exports.SleepDetection = void 0;
const typeorm_1 = require("typeorm");
let SleepDetection = class SleepDetection {
    id;
    userId;
    nightDate;
    bedtime;
    wakeTime;
    durationHours;
    interruptionCount;
    continuity;
    regularity;
    validCoverage;
    confidence;
};
exports.SleepDetection = SleepDetection;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], SleepDetection.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar'),
    __metadata("design:type", String)
], SleepDetection.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)('timestamptz'),
    __metadata("design:type", Date)
], SleepDetection.prototype, "nightDate", void 0);
__decorate([
    (0, typeorm_1.Column)('timestamptz', { nullable: true }),
    __metadata("design:type", Date)
], SleepDetection.prototype, "bedtime", void 0);
__decorate([
    (0, typeorm_1.Column)('timestamptz', { nullable: true }),
    __metadata("design:type", Date)
], SleepDetection.prototype, "wakeTime", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { default: 0 }),
    __metadata("design:type", Number)
], SleepDetection.prototype, "durationHours", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { default: 0 }),
    __metadata("design:type", Number)
], SleepDetection.prototype, "interruptionCount", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { default: 0 }),
    __metadata("design:type", Number)
], SleepDetection.prototype, "continuity", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { default: 0 }),
    __metadata("design:type", Number)
], SleepDetection.prototype, "regularity", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { default: 0 }),
    __metadata("design:type", Number)
], SleepDetection.prototype, "validCoverage", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { default: 0 }),
    __metadata("design:type", Number)
], SleepDetection.prototype, "confidence", void 0);
exports.SleepDetection = SleepDetection = __decorate([
    (0, typeorm_1.Entity)('sleep_detections'),
    (0, typeorm_1.Index)(['userId', 'nightDate'])
], SleepDetection);
//# sourceMappingURL=sleep-detection.entity.js.map