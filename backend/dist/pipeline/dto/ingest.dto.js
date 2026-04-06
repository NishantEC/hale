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
exports.IngestDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class SignalSampleDto {
    timestamp;
    source;
    heartRate;
    ibiMs;
    motionScore;
    qualityScore;
}
__decorate([
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], SignalSampleDto.prototype, "timestamp", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SignalSampleDto.prototype, "source", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SignalSampleDto.prototype, "heartRate", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Object)
], SignalSampleDto.prototype, "ibiMs", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Object)
], SignalSampleDto.prototype, "motionScore", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SignalSampleDto.prototype, "qualityScore", void 0);
class HistoricalSensorRecordDto {
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
}
__decorate([
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], HistoricalSensorRecordDto.prototype, "timestamp", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], HistoricalSensorRecordDto.prototype, "heartRate", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Object)
], HistoricalSensorRecordDto.prototype, "rrAverageMs", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Object)
], HistoricalSensorRecordDto.prototype, "spo2Red", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Object)
], HistoricalSensorRecordDto.prototype, "spo2IR", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Object)
], HistoricalSensorRecordDto.prototype, "skinTempRaw", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Object)
], HistoricalSensorRecordDto.prototype, "gravityMagnitude", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Object)
], HistoricalSensorRecordDto.prototype, "gravityX", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Object)
], HistoricalSensorRecordDto.prototype, "gravityY", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Object)
], HistoricalSensorRecordDto.prototype, "gravityZ", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Object)
], HistoricalSensorRecordDto.prototype, "respRateRaw", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Object)
], HistoricalSensorRecordDto.prototype, "skinContact", void 0);
class IngestDto {
    signalSamples;
    historicalSensorRecords;
}
exports.IngestDto = IngestDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => SignalSampleDto),
    __metadata("design:type", Array)
], IngestDto.prototype, "signalSamples", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => HistoricalSensorRecordDto),
    __metadata("design:type", Array)
], IngestDto.prototype, "historicalSensorRecords", void 0);
//# sourceMappingURL=ingest.dto.js.map