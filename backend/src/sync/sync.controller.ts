import { Body, Controller, Get, Post, Req, UseGuards, Logger, HttpException, HttpStatus, UsePipes, ValidationPipe } from '@nestjs/common';
import { SessionGuard } from '../auth/auth.guard.js';
import { SyncService } from './sync.service.js';
import { PushSyncDto } from './dto/push-sync.dto.js';

@Controller('sync')
@UseGuards(SessionGuard)
export class SyncController {
  private readonly logger = new Logger(SyncController.name);
  constructor(private readonly syncService: SyncService) {}

  @Post('push')
  @UsePipes(new ValidationPipe({ whitelist: false, transform: false }))
  async push(@Req() req: any, @Body() dto: PushSyncDto) {
    try {
      const upserted = await this.syncService.push(req.user.userId, dto);
      return { ok: true, upserted };
    } catch (e) {
      this.logger.error(`push failed: ${e.message}`, e.stack);
      throw new HttpException(`Push failed: ${e.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('pull')
  async pull(@Req() req: any) {
    try {
      return await this.syncService.pull(req.user.userId);
    } catch (e) {
      this.logger.error(`pull failed: ${e.message}`, e.stack);
      throw new HttpException(`Pull failed: ${e.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
