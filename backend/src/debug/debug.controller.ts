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
      return await this.debugService.getOverview(req.user.userId, query.date);
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
      return await this.debugService.getSleepNight(req.user.userId, query.date);
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

  @Post('pipeline/run')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async runPipeline(@Req() req: any, @Query() query: DebugDateQueryDto) {
    try {
      return await this.debugService.runPipeline(req.user.userId, query.date);
    } catch (e) {
      this.logger.error(`debug pipeline run failed: ${e.message}`, e.stack);
      throw e;
    }
  }

  @Post('views/recompute')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async recomputeViews(@Req() req: any, @Query() query: DebugDateQueryDto) {
    try {
      return await this.debugService.recomputeViews(req.user.userId, query.date);
    } catch (e) {
      this.logger.error(`views recompute failed: ${e.message}`, e.stack);
      throw e;
    }
  }
}
