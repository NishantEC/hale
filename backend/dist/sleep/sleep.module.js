"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SleepModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const sleep_detection_entity_js_1 = require("./entities/sleep-detection.entity.js");
const sleep_stage_entity_js_1 = require("./entities/sleep-stage.entity.js");
const night_feature_entity_js_1 = require("./entities/night-feature.entity.js");
let SleepModule = class SleepModule {
};
exports.SleepModule = SleepModule;
exports.SleepModule = SleepModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([sleep_detection_entity_js_1.SleepDetection, sleep_stage_entity_js_1.SleepStage, night_feature_entity_js_1.NightFeature])],
        exports: [typeorm_1.TypeOrmModule],
    })
], SleepModule);
//# sourceMappingURL=sleep.module.js.map