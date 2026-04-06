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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var DebugController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebugController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_js_1 = require("../auth/auth.guard.js");
const debug_date_query_dto_js_1 = require("./dto/debug-date-query.dto.js");
const debug_raw_records_query_dto_js_1 = require("./dto/debug-raw-records-query.dto.js");
const debug_service_js_1 = require("./debug.service.js");
let DebugController = DebugController_1 = class DebugController {
    debugService;
    logger = new common_1.Logger(DebugController_1.name);
    constructor(debugService) {
        this.debugService = debugService;
    }
    async getOverview(req, query) {
        try {
            return await this.debugService.getOverview(req.user.userId, query.date);
        }
        catch (e) {
            this.logger.error(`overview failed: ${e.message}`, e.stack);
            throw e;
        }
    }
    async getRawRecords(req, query) {
        try {
            return await this.debugService.getRawRecords(req.user.userId, query.date, query.limit ?? 200);
        }
        catch (e) {
            this.logger.error(`raw-records failed: ${e.message}`, e.stack);
            throw e;
        }
    }
    async getSleepNight(req, query) {
        try {
            return await this.debugService.getSleepNight(req.user.userId, query.date);
        }
        catch (e) {
            this.logger.error(`sleep-night failed: ${e.message}`, e.stack);
            throw e;
        }
    }
    async getPipelineResults(req) {
        try {
            return await this.debugService.getPipelineResults(req.user.userId);
        }
        catch (e) {
            this.logger.error(`pipeline-results failed: ${e.message}`, e.stack);
            throw e;
        }
    }
    async runPipeline(req, query) {
        try {
            return await this.debugService.runPipeline(req.user.userId, query.date);
        }
        catch (e) {
            this.logger.error(`debug pipeline run failed: ${e.message}`, e.stack);
            throw e;
        }
    }
    async recomputeViews(req, query) {
        try {
            return await this.debugService.recomputeViews(req.user.userId, query.date);
        }
        catch (e) {
            this.logger.error(`views recompute failed: ${e.message}`, e.stack);
            throw e;
        }
    }
};
exports.DebugController = DebugController;
__decorate([
    (0, common_1.Get)('overview'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ transform: true, whitelist: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, debug_date_query_dto_js_1.DebugDateQueryDto]),
    __metadata("design:returntype", Promise)
], DebugController.prototype, "getOverview", null);
__decorate([
    (0, common_1.Get)('raw-records'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ transform: true, whitelist: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, debug_raw_records_query_dto_js_1.DebugRawRecordsQueryDto]),
    __metadata("design:returntype", Promise)
], DebugController.prototype, "getRawRecords", null);
__decorate([
    (0, common_1.Get)('sleep-night'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ transform: true, whitelist: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, debug_date_query_dto_js_1.DebugDateQueryDto]),
    __metadata("design:returntype", Promise)
], DebugController.prototype, "getSleepNight", null);
__decorate([
    (0, common_1.Get)('pipeline-results'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DebugController.prototype, "getPipelineResults", null);
__decorate([
    (0, common_1.Post)('pipeline/run'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ transform: true, whitelist: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, debug_date_query_dto_js_1.DebugDateQueryDto]),
    __metadata("design:returntype", Promise)
], DebugController.prototype, "runPipeline", null);
__decorate([
    (0, common_1.Post)('views/recompute'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ transform: true, whitelist: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, debug_date_query_dto_js_1.DebugDateQueryDto]),
    __metadata("design:returntype", Promise)
], DebugController.prototype, "recomputeViews", null);
exports.DebugController = DebugController = DebugController_1 = __decorate([
    (0, common_1.Controller)('debug'),
    (0, common_1.UseGuards)(auth_guard_js_1.SessionGuard),
    __metadata("design:paramtypes", [debug_service_js_1.DebugService])
], DebugController);
//# sourceMappingURL=debug.controller.js.map