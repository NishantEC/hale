"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncModule = void 0;
const common_1 = require("@nestjs/common");
const sleep_module_js_1 = require("../sleep/sleep.module.js");
const wellness_module_js_1 = require("../wellness/wellness.module.js");
const journal_module_js_1 = require("../journal/journal.module.js");
const plans_module_js_1 = require("../plans/plans.module.js");
const sync_service_js_1 = require("./sync.service.js");
const sync_controller_js_1 = require("./sync.controller.js");
const auth_guard_js_1 = require("../auth/auth.guard.js");
let SyncModule = class SyncModule {
};
exports.SyncModule = SyncModule;
exports.SyncModule = SyncModule = __decorate([
    (0, common_1.Module)({
        imports: [sleep_module_js_1.SleepModule, wellness_module_js_1.WellnessModule, journal_module_js_1.JournalModule, plans_module_js_1.PlansModule],
        controllers: [sync_controller_js_1.SyncController],
        providers: [sync_service_js_1.SyncService, auth_guard_js_1.SessionGuard],
    })
], SyncModule);
//# sourceMappingURL=sync.module.js.map