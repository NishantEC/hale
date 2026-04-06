"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const database_config_js_1 = require("./config/database.config.js");
const auth_module_js_1 = require("./auth/auth.module.js");
const sleep_module_js_1 = require("./sleep/sleep.module.js");
const wellness_module_js_1 = require("./wellness/wellness.module.js");
const journal_module_js_1 = require("./journal/journal.module.js");
const plans_module_js_1 = require("./plans/plans.module.js");
const devices_module_js_1 = require("./devices/devices.module.js");
const sync_module_js_1 = require("./sync/sync.module.js");
const pipeline_module_js_1 = require("./pipeline/pipeline.module.js");
const views_module_js_1 = require("./views/views.module.js");
const debug_module_js_1 = require("./debug/debug.module.js");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            typeorm_1.TypeOrmModule.forRoot((0, database_config_js_1.databaseConfig)()),
            auth_module_js_1.AuthModule,
            sleep_module_js_1.SleepModule,
            wellness_module_js_1.WellnessModule,
            journal_module_js_1.JournalModule,
            plans_module_js_1.PlansModule,
            devices_module_js_1.DevicesModule,
            sync_module_js_1.SyncModule,
            pipeline_module_js_1.PipelineModule,
            views_module_js_1.ViewsModule,
            debug_module_js_1.DebugModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map