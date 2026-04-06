"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WellnessModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const daily_score_entity_js_1 = require("./entities/daily-score.entity.js");
const daily_metric_entity_js_1 = require("./entities/daily-metric.entity.js");
const signal_sample_entity_js_1 = require("./entities/signal-sample.entity.js");
let WellnessModule = class WellnessModule {
};
exports.WellnessModule = WellnessModule;
exports.WellnessModule = WellnessModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([daily_score_entity_js_1.DailyScore, daily_metric_entity_js_1.DailyMetric, signal_sample_entity_js_1.SignalSample])],
        exports: [typeorm_1.TypeOrmModule],
    })
], WellnessModule);
//# sourceMappingURL=wellness.module.js.map