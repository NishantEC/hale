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
var PipelineController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_js_1 = require("../auth/auth.guard.js");
const pipeline_service_js_1 = require("./pipeline.service.js");
const ingest_dto_js_1 = require("./dto/ingest.dto.js");
let PipelineController = PipelineController_1 = class PipelineController {
    pipelineService;
    logger = new common_1.Logger(PipelineController_1.name);
    constructor(pipelineService) {
        this.pipelineService = pipelineService;
    }
    async ingest(req, dto) {
        try {
            return await this.pipelineService.ingest(req.user.userId, dto);
        }
        catch (e) {
            this.logger.error(`ingest failed: ${e.message}`, e.stack);
            throw new common_1.HttpException(`Ingest failed: ${e.message}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async run(req) {
        try {
            return await this.pipelineService.runPipeline(req.user.userId);
        }
        catch (e) {
            this.logger.error(`pipeline run failed: ${e.message}`, e.stack);
            throw new common_1.HttpException(`Pipeline run failed: ${e.message}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async results(req) {
        try {
            return await this.pipelineService.getResults(req.user.userId);
        }
        catch (e) {
            this.logger.error(`results fetch failed: ${e.message}`, e.stack);
            throw new common_1.HttpException(`Results failed: ${e.message}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.PipelineController = PipelineController;
__decorate([
    (0, common_1.Post)('ingest'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: false, transform: false })),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, ingest_dto_js_1.IngestDto]),
    __metadata("design:returntype", Promise)
], PipelineController.prototype, "ingest", null);
__decorate([
    (0, common_1.Post)('run'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PipelineController.prototype, "run", null);
__decorate([
    (0, common_1.Get)('results'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PipelineController.prototype, "results", null);
exports.PipelineController = PipelineController = PipelineController_1 = __decorate([
    (0, common_1.Controller)('pipeline'),
    (0, common_1.UseGuards)(auth_guard_js_1.SessionGuard),
    __metadata("design:paramtypes", [pipeline_service_js_1.PipelineService])
], PipelineController);
//# sourceMappingURL=pipeline.controller.js.map