import {
  Controller,
  Get,
  Logger,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import { SessionGuard } from '../auth/auth.guard.js';
import { DebugDateQueryDto } from './dto/debug-date-query.dto.js';
import { DebugRawRecordsQueryDto } from './dto/debug-raw-records-query.dto.js';
import { DebugService } from './debug.service.js';

@Controller('debug')
@UseGuards(SessionGuard)
export class DebugController {
  private readonly logger = new Logger(DebugController.name);

  constructor(private readonly debugService: DebugService) {}

  @Get('overview')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async getOverview(@Req() req: any, @Query() query: DebugDateQueryDto) {
    try {
      return await this.debugService.getOverview(
        req.user.userId,
        query.date,
        query.timeZone ?? query.tz,
      );
    } catch (e) {
      this.logger.error(`overview failed: ${e.message}`, e.stack);
      throw e;
    }
  }

  @Get('raw-records')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async getRawRecords(@Req() req: any, @Query() query: DebugRawRecordsQueryDto) {
    try {
      return await this.debugService.getRawRecords(
        req.user.userId,
        query.date,
        query.timeZone ?? query.tz,
        query.limit ?? 200,
      );
    } catch (e) {
      this.logger.error(`raw-records failed: ${e.message}`, e.stack);
      throw e;
    }
  }

  @Get('sleep-night')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async getSleepNight(@Req() req: any, @Query() query: DebugDateQueryDto) {
    try {
      return await this.debugService.getSleepNight(
        req.user.userId,
        query.date,
        query.timeZone ?? query.tz,
      );
    } catch (e) {
      this.logger.error(`sleep-night failed: ${e.message}`, e.stack);
      throw e;
    }
  }

  @Get('pipeline-results')
  async getPipelineResults(@Req() req: any) {
    try {
      return await this.debugService.getPipelineResults(req.user.userId);
    } catch (e) {
      this.logger.error(`pipeline-results failed: ${e.message}`, e.stack);
      throw e;
    }
  }

  @Get('pipeline-state')
  async getPipelineState(@Req() req: any) {
    try {
      return await this.debugService.getPipelineState(req.user.userId);
    } catch (e) {
      this.logger.error(`pipeline-state failed: ${e.message}`, e.stack);
      throw e;
    }
  }

  @Get('pipeline-runs')
  async getPipelineRuns(@Req() req: any, @Query('limit') limit?: string) {
    try {
      const n = limit ? Math.min(Math.max(parseInt(limit, 10) || 30, 1), 200) : 30;
      return await this.debugService.getPipelineRuns(req.user.userId, n);
    } catch (e) {
      this.logger.error(`pipeline-runs failed: ${e.message}`, e.stack);
      throw e;
    }
  }

  @Post('pipeline/run')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async runPipeline(@Req() req: any, @Query() query: DebugDateQueryDto) {
    try {
      return await this.debugService.runPipeline(
        req.user.userId,
        query.date,
        query.timeZone ?? query.tz,
      );
    } catch (e) {
      this.logger.error(`debug pipeline run failed: ${e.message}`, e.stack);
      throw e;
    }
  }

  @Post('views/recompute')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async recomputeViews(@Req() req: any, @Query() query: DebugDateQueryDto) {
    try {
      return await this.debugService.recomputeViews(
        req.user.userId,
        query.date,
        query.timeZone ?? query.tz,
      );
    } catch (e) {
      this.logger.error(`views recompute failed: ${e.message}`, e.stack);
      throw e;
    }
  }

  @Get('telemetry')
  async getTelemetry(@Req() req: any, @Query('limit') limit?: string) {
    try {
      const n = limit ? Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000) : 200;
      return await this.debugService.getTelemetry(req.user.userId, n);
    } catch (e) {
      this.logger.error(`telemetry failed: ${e.message}`, e.stack);
      throw e;
    }
  }

  @Post('seed')
  async seedDemoData(@Req() req: any, @Query('nights') nights?: string) {
    try {
      const n = nights ? Math.min(Math.max(parseInt(nights, 10) || 7, 1), 30) : 7;
      return await this.debugService.seedDemoData(req.user.userId, n);
    } catch (e) {
      this.logger.error(`seed failed: ${e.message}`, e.stack);
      throw e;
    }
  }
}
