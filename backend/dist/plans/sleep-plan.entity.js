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
exports.SleepPlan = void 0;
const typeorm_1 = require("typeorm");
let SleepPlan = class SleepPlan {
    id;
    userId;
    targetSleepMinutes;
    wakeMinutes;
    alarmEnabled;
    alarmMinutes;
    smartWakeEnabled;
    updatedAt;
};
exports.SleepPlan = SleepPlan;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], SleepPlan.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar', { unique: true }),
    __metadata("design:type", String)
], SleepPlan.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { default: 480 }),
    __metadata("design:type", Number)
], SleepPlan.prototype, "targetSleepMinutes", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { default: 420 }),
    __metadata("design:type", Number)
], SleepPlan.prototype, "wakeMinutes", void 0);
__decorate([
    (0, typeorm_1.Column)('boolean', { default: false }),
    __metadata("design:type", Boolean)
], SleepPlan.prototype, "alarmEnabled", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { default: 420 }),
    __metadata("design:type", Number)
], SleepPlan.prototype, "alarmMinutes", void 0);
__decorate([
    (0, typeorm_1.Column)('boolean', { default: false }),
    __metadata("design:type", Boolean)
], SleepPlan.prototype, "smartWakeEnabled", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], SleepPlan.prototype, "updatedAt", void 0);
exports.SleepPlan = SleepPlan = __decorate([
    (0, typeorm_1.Entity)('sleep_plans')
], SleepPlan);
//# sourceMappingURL=sleep-plan.entity.js.map