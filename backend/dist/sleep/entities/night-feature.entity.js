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
exports.NightFeature = void 0;
const typeorm_1 = require("typeorm");
let NightFeature = class NightFeature {
    id;
    userId;
    nightDate;
    restingHeartRate;
    rmssd;
    sdnn;
    respiratoryRate;
    continuity;
    regularity;
    validCoverage;
    confidenceRaw;
    sleepEstimateHours;
    sourceBlend;
};
exports.NightFeature = NightFeature;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], NightFeature.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar'),
    __metadata("design:type", String)
], NightFeature.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)('timestamptz'),
    __metadata("design:type", Date)
], NightFeature.prototype, "nightDate", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { default: 0 }),
    __metadata("design:type", Number)
], NightFeature.prototype, "restingHeartRate", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { default: 0 }),
    __metadata("design:type", Number)
], NightFeature.prototype, "rmssd", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { default: 0 }),
    __metadata("design:type", Number)
], NightFeature.prototype, "sdnn", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { default: 0 }),
    __metadata("design:type", Number)
], NightFeature.prototype, "respiratoryRate", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { default: 0 }),
    __metadata("design:type", Number)
], NightFeature.prototype, "continuity", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { default: 0 }),
    __metadata("design:type", Number)
], NightFeature.prototype, "regularity", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { default: 0 }),
    __metadata("design:type", Number)
], NightFeature.prototype, "validCoverage", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { default: 0 }),
    __metadata("design:type", Number)
], NightFeature.prototype, "confidenceRaw", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { default: 0 }),
    __metadata("design:type", Number)
], NightFeature.prototype, "sleepEstimateHours", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 'Unknown' }),
    __metadata("design:type", String)
], NightFeature.prototype, "sourceBlend", void 0);
exports.NightFeature = NightFeature = __decorate([
    (0, typeorm_1.Entity)('night_features'),
    (0, typeorm_1.Index)(['userId', 'nightDate'])
], NightFeature);
//# sourceMappingURL=night-feature.entity.js.map