"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebugModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const pipeline_module_js_1 = require("../pipeline/pipeline.module.js");
const raw_sensor_record_entity_js_1 = require("../pipeline/entities/raw-sensor-record.entity.js");
const sleep_detection_entity_js_1 = require("../sleep/entities/sleep-detection.entity.js");
const sleep_stage_entity_js_1 = require("../sleep/entities/sleep-stage.entity.js");
const night_feature_entity_js_1 = require("../sleep/entities/night-feature.entity.js");
const daily_score_entity_js_1 = require("../wellness/entities/daily-score.entity.js");
const daily_metric_entity_js_1 = require("../wellness/entities/daily-metric.entity.js");
const sleep_plan_entity_js_1 = require("../plans/sleep-plan.entity.js");
const views_module_js_1 = require("../views/views.module.js");
const debug_controller_js_1 = require("./debug.controller.js");
const debug_service_js_1 = require("./debug.service.js");
let DebugModule = class DebugModule {
};
exports.DebugModule = DebugModule;
exports.DebugModule = DebugModule = __decorate([
    (0, common_1.Module)({
        imports: [
            pipeline_module_js_1.PipelineModule,
            views_module_js_1.ViewsModule,
            typeorm_1.TypeOrmModule.forFeature([
                raw_sensor_record_entity_js_1.RawSensorRecord,
                sleep_detection_entity_js_1.SleepDetection,
                sleep_stage_entity_js_1.SleepStage,
                night_feature_entity_js_1.NightFeature,
                daily_score_entity_js_1.DailyScore,
                daily_metric_entity_js_1.DailyMetric,
                sleep_plan_entity_js_1.SleepPlan,
            ]),
        ],
        controllers: [debug_controller_js_1.DebugController],
        providers: [debug_service_js_1.DebugService],
    })
], DebugModule);
//# sourceMappingURL=debug.module.js.map