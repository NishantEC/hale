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
var ViewsController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ViewsController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_js_1 = require("../auth/auth.guard.js");
const update_sleep_plan_dto_js_1 = require("./dto/update-sleep-plan.dto.js");
const views_service_js_1 = require("./views.service.js");
let ViewsController = ViewsController_1 = class ViewsController {
    viewsService;
    logger = new common_1.Logger(ViewsController_1.name);
    constructor(viewsService) {
        this.viewsService = viewsService;
    }
    async home(req, date) {
        try {
            return await this.viewsService.getHomeView(req.user.userId, date);
        }
        catch (e) {
            this.logger.error(`home view failed: ${e.message}`, e.stack);
            throw new common_1.HttpException(`Home view failed: ${e.message}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async sleep(req, date) {
        try {
            return await this.viewsService.getSleepView(req.user.userId, date);
        }
        catch (e) {
            this.logger.error(`sleep view failed: ${e.message}`, e.stack);
            throw new common_1.HttpException(`Sleep view failed: ${e.message}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async updateSleepPlan(req, dto) {
        try {
            return await this.viewsService.updateSleepPlan(req.user.userId, dto);
        }
        catch (e) {
            this.logger.error(`sleep plan update failed: ${e.message}`, e.stack);
            throw new common_1.HttpException(`Sleep plan update failed: ${e.message}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.ViewsController = ViewsController;
__decorate([
    (0, common_1.Get)('home'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('date')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ViewsController.prototype, "home", null);
__decorate([
    (0, common_1.Get)('sleep'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('date')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ViewsController.prototype, "sleep", null);
__decorate([
    (0, common_1.Put)('sleep-plan'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true, transform: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, update_sleep_plan_dto_js_1.UpdateSleepPlanDto]),
    __metadata("design:returntype", Promise)
], ViewsController.prototype, "updateSleepPlan", null);
exports.ViewsController = ViewsController = ViewsController_1 = __decorate([
    (0, common_1.Controller)('views'),
    (0, common_1.UseGuards)(auth_guard_js_1.SessionGuard),
    __metadata("design:paramtypes", [views_service_js_1.ViewsService])
], ViewsController);
//# sourceMappingURL=views.controller.js.map