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
exports.RawSensorRecord = void 0;
const typeorm_1 = require("typeorm");
let RawSensorRecord = class RawSensorRecord {
    id;
    userId;
    timestamp;
    heartRate;
    rrAverageMs;
    spo2Red;
    spo2IR;
    skinTempRaw;
    gravityMagnitude;
    gravityX;
    gravityY;
    gravityZ;
    respRateRaw;
    skinContact;
};
exports.RawSensorRecord = RawSensorRecord;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], RawSensorRecord.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar'),
    __metadata("design:type", String)
], RawSensorRecord.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)('timestamptz'),
    __metadata("design:type", Date)
], RawSensorRecord.prototype, "timestamp", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { default: 0 }),
    __metadata("design:type", Number)
], RawSensorRecord.prototype, "heartRate", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { nullable: true }),
    __metadata("design:type", Number)
], RawSensorRecord.prototype, "rrAverageMs", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { nullable: true }),
    __metadata("design:type", Number)
], RawSensorRecord.prototype, "spo2Red", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { nullable: true }),
    __metadata("design:type", Number)
], RawSensorRecord.prototype, "spo2IR", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { nullable: true }),
    __metadata("design:type", Number)
], RawSensorRecord.prototype, "skinTempRaw", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { nullable: true }),
    __metadata("design:type", Number)
], RawSensorRecord.prototype, "gravityMagnitude", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { nullable: true }),
    __metadata("design:type", Number)
], RawSensorRecord.prototype, "gravityX", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { nullable: true }),
    __metadata("design:type", Number)
], RawSensorRecord.prototype, "gravityY", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { nullable: true }),
    __metadata("design:type", Number)
], RawSensorRecord.prototype, "gravityZ", void 0);
__decorate([
    (0, typeorm_1.Column)('double precision', { nullable: true }),
    __metadata("design:type", Number)
], RawSensorRecord.prototype, "respRateRaw", void 0);
__decorate([
    (0, typeorm_1.Column)('boolean', { nullable: true }),
    __metadata("design:type", Boolean)
], RawSensorRecord.prototype, "skinContact", void 0);
exports.RawSensorRecord = RawSensorRecord = __decorate([
    (0, typeorm_1.Entity)('raw_sensor_records'),
    (0, typeorm_1.Index)(['userId', 'timestamp'])
], RawSensorRecord);
//# sourceMappingURL=raw-sensor-record.entity.js.map