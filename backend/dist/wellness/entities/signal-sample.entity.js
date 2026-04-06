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
exports.SignalSample = void 0;
const typeorm_1 = require("typeorm");
let SignalSample = class SignalSample {
    id;
    userId;
    timestamp;
    source;
    heartRate;
    ibiMs;
    motionScore;
    qualityScore;
};
exports.SignalSample = SignalSample;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], SignalSample.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar'),
    __metadata("design:type", String)
], SignalSample.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)('timestamptz'),
    __metadata("design:type", Date)
], SignalSample.prototype, "timestamp", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 'strap' }),
    __metadata("design:type", String)
], SignalSample.prototype, "source", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { nullable: true }),
    __metadata("design:type", Number)
], SignalSample.prototype, "heartRate", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { nullable: true }),
    __metadata("design:type", Number)
], SignalSample.prototype, "ibiMs", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { nullable: true }),
    __metadata("design:type", Number)
], SignalSample.prototype, "motionScore", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { nullable: true }),
    __metadata("design:type", Number)
], SignalSample.prototype, "qualityScore", void 0);
exports.SignalSample = SignalSample = __decorate([
    (0, typeorm_1.Entity)('signal_samples'),
    (0, typeorm_1.Index)(['userId', 'timestamp'])
], SignalSample);
//# sourceMappingURL=signal-sample.entity.js.map