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
exports.SleepStage = void 0;
const typeorm_1 = require("typeorm");
let SleepStage = class SleepStage {
    id;
    userId;
    nightDate;
    remMinutes;
    coreMinutes;
    deepMinutes;
    awakeMinutes;
    unknownMinutes;
    confidence;
    source;
    epochTimeline;
    epochMinutes;
};
exports.SleepStage = SleepStage;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], SleepStage.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar'),
    __metadata("design:type", String)
], SleepStage.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)('timestamptz'),
    __metadata("design:type", Date)
], SleepStage.prototype, "nightDate", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { default: 0 }),
    __metadata("design:type", Number)
], SleepStage.prototype, "remMinutes", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { default: 0 }),
    __metadata("design:type", Number)
], SleepStage.prototype, "coreMinutes", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { default: 0 }),
    __metadata("design:type", Number)
], SleepStage.prototype, "deepMinutes", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { default: 0 }),
    __metadata("design:type", Number)
], SleepStage.prototype, "awakeMinutes", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { default: 0 }),
    __metadata("design:type", Number)
], SleepStage.prototype, "unknownMinutes", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { default: 0 }),
    __metadata("design:type", Number)
], SleepStage.prototype, "confidence", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 'Strap' }),
    __metadata("design:type", String)
], SleepStage.prototype, "source", void 0);
__decorate([
    (0, typeorm_1.Column)('jsonb', { nullable: true }),
    __metadata("design:type", Object)
], SleepStage.prototype, "epochTimeline", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { default: 1 }),
    __metadata("design:type", Number)
], SleepStage.prototype, "epochMinutes", void 0);
exports.SleepStage = SleepStage = __decorate([
    (0, typeorm_1.Entity)('sleep_stages'),
    (0, typeorm_1.Index)(['userId', 'nightDate'])
], SleepStage);
//# sourceMappingURL=sleep-stage.entity.js.map