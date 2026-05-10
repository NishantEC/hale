import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import { SessionGuard } from '../auth/auth.guard.js';
import { HealthkitService } from './healthkit.service.js';
import {
  HealthkitSyncDto,
  BarometerSyncDto,
  MotionActivitySyncDto,
} from './dto/healthkit-sync.dto.js';

@Controller('healthkit')
@UseGuards(SessionGuard)
export class HealthkitController {
  private readonly logger = new Logger(HealthkitController.name);

  constructor(private readonly svc: HealthkitService) {}

  @Post('sync')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async sync(@Req() req: any, @Body() dto: HealthkitSyncDto) {
    try {
      const result = await this.svc.sync(req.user.userId, dto);
      return { ok: true, ...result };
    } catch (e) {
      this.logger.error(`healthkit sync failed: ${e.message}`, e.stack);
      throw new HttpException(`HealthKit sync failed: ${e.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('barometer')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async barometer(@Req() req: any, @Body() dto: BarometerSyncDto) {
    try {
      const inserted = await this.svc.ingestBarometer(req.user.userId, dto);
      return { ok: true, inserted };
    } catch (e) {
      this.logger.error(`barometer ingest failed: ${e.message}`, e.stack);
      throw new HttpException(`Barometer ingest failed: ${e.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('motion-activity')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async motionActivity(@Req() req: any, @Body() dto: MotionActivitySyncDto) {
    try {
      const inserted = await this.svc.ingestMotionActivity(req.user.userId, dto);
      return { ok: true, inserted };
    } catch (e) {
      this.logger.error(`motion-activity ingest failed: ${e.message}`, e.stack);
      throw new HttpException(`Motion-activity ingest failed: ${e.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
