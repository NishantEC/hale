import { Body, Controller, Get, Param, Post, Query, Req, UseGuards, Logger, HttpException, HttpStatus, UsePipes, ValidationPipe } from '@nestjs/common';
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

  // Per-table incremental pull. Consumed by the app's downlinkPuller
  // to hydrate its local SQLite mirror from backend derived tables.
  // Returns rows where updatedAt > since, ordered ascending, capped at
  // `limit` (default 1000, max 5000), plus a hasMore flag for paging.
  @Get(':tableName')
  async pullSince(
    @Req() req: any,
    @Param('tableName') tableName: string,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      const sinceMs = Number(since ?? 0) || 0;
      const parsedLimit = Math.min(Number(limit ?? 1000) || 1000, 5000);
      return await this.syncService.pullSince(req.user.userId, tableName, sinceMs, parsedLimit);
    } catch (e) {
      this.logger.error(`pullSince(${tableName}) failed: ${e.message}`, e.stack);
      throw new HttpException(`Pull failed: ${e.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
