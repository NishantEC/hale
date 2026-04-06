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
var SyncController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_js_1 = require("../auth/auth.guard.js");
const sync_service_js_1 = require("./sync.service.js");
const push_sync_dto_js_1 = require("./dto/push-sync.dto.js");
let SyncController = SyncController_1 = class SyncController {
    syncService;
    logger = new common_1.Logger(SyncController_1.name);
    constructor(syncService) {
        this.syncService = syncService;
    }
    async push(req, dto) {
        try {
            const upserted = await this.syncService.push(req.user.userId, dto);
            return { ok: true, upserted };
        }
        catch (e) {
            this.logger.error(`push failed: ${e.message}`, e.stack);
            throw new common_1.HttpException(`Push failed: ${e.message}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async pull(req) {
        try {
            return await this.syncService.pull(req.user.userId);
        }
        catch (e) {
            this.logger.error(`pull failed: ${e.message}`, e.stack);
            throw new common_1.HttpException(`Pull failed: ${e.message}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.SyncController = SyncController;
__decorate([
    (0, common_1.Post)('push'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: false, transform: false })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, push_sync_dto_js_1.PushSyncDto]),
    __metadata("design:returntype", Promise)
], SyncController.prototype, "push", null);
__decorate([
    (0, common_1.Get)('pull'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SyncController.prototype, "pull", null);
exports.SyncController = SyncController = SyncController_1 = __decorate([
    (0, common_1.Controller)('sync'),
    (0, common_1.UseGuards)(auth_guard_js_1.SessionGuard),
    __metadata("design:paramtypes", [sync_service_js_1.SyncService])
], SyncController);
//# sourceMappingURL=sync.controller.js.map