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
exports.BaselineProfile = void 0;
const typeorm_1 = require("typeorm");
let BaselineProfile = class BaselineProfile {
    id;
    userId;
    restingHeartRate;
    rmssd;
    sdnn;
    nightsUsed;
    updatedAt;
};
exports.BaselineProfile = BaselineProfile;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], BaselineProfile.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar', { unique: true }),
    __metadata("design:type", String)
], BaselineProfile.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { default: 0 }),
    __metadata("design:type", Number)
], BaselineProfile.prototype, "restingHeartRate", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { default: 0 }),
    __metadata("design:type", Number)
], BaselineProfile.prototype, "rmssd", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { default: 0 }),
    __metadata("design:type", Number)
], BaselineProfile.prototype, "sdnn", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { default: 0 }),
    __metadata("design:type", Number)
], BaselineProfile.prototype, "nightsUsed", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], BaselineProfile.prototype, "updatedAt", void 0);
exports.BaselineProfile = BaselineProfile = __decorate([
    (0, typeorm_1.Entity)('baseline_profiles')
], BaselineProfile);
//# sourceMappingURL=baseline-profile.entity.js.map