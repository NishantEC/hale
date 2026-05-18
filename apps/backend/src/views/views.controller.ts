import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Put,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SessionGuard } from '../auth/auth.guard.js';
import { UpdateSleepPlanDto } from './dto/update-sleep-plan.dto.js';
import { ViewsService } from './views.service.js';

@Controller('views')
@UseGuards(SessionGuard)
export class ViewsController {
  private readonly logger = new Logger(ViewsController.name);

  constructor(private readonly viewsService: ViewsService) {}

  @Get('home')
  async home(
    @Req() req: any,
    @Query('date') date?: string,
    @Query('timeZone') timeZone?: string,
    @Query('tz') tz?: string,
  ) {
    try {
      return await this.viewsService.getHomeView(req.user.userId, date, timeZone ?? tz);
    } catch (e) {
      this.logger.error(`home view failed: ${e.message}`, e.stack);
      if (e instanceof HttpException) throw e;
      throw new HttpException(`Home view failed: ${e.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('sleep')
  async sleep(
    @Req() req: any,
    @Query('date') date?: string,
    @Query('timeZone') timeZone?: string,
    @Query('tz') tz?: string,
  ) {
    try {
      return await this.viewsService.getSleepView(req.user.userId, date, timeZone ?? tz);
    } catch (e) {
      this.logger.error(`sleep view failed: ${e.message}`, e.stack);
      if (e instanceof HttpException) throw e;
      throw new HttpException(`Sleep view failed: ${e.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('coverage')
  async coverage(
    @Req() req: any,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('timeZone') timeZone?: string,
  ) {
    if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) {
      throw new BadRequestException('from/to must be YYYY-MM');
    }
    if (from > to) {
      throw new BadRequestException('from must be <= to (range)');
    }
    // 13 months back, matching the client's 12-month cap with a 1-month
    // buffer for cross-month requests near the boundary.
    const now = new Date();
    const limit = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 13, 1));
    const [fy, fm] = from.split('-').map(Number);
    const fromMonthStart = new Date(Date.UTC(fy, fm - 1, 1));
    if (fromMonthStart < limit) {
      throw new BadRequestException('range too old (>13 months back)');
    }
    return this.viewsService.getCoverage(req.user.userId, from, to, timeZone);
  }

  @Get('trends')
  async trends(@Req() req: any, @Query('days') days?: string) {
    try {
      const n = days ? Math.min(Math.max(parseInt(days, 10) || 30, 7), 90) : 30;
      return await this.viewsService.getTrendsView(req.user.userId, n);
    } catch (e) {
      this.logger.error(`trends view failed: ${e.message}`, e.stack);
      if (e instanceof HttpException) throw e;
      throw new HttpException(`Trends view failed: ${e.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put('sleep-plan')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async updateSleepPlan(@Req() req: any, @Body() dto: UpdateSleepPlanDto) {
    try {
      return await this.viewsService.updateSleepPlan(req.user.userId, dto);
    } catch (e) {
      this.logger.error(`sleep plan update failed: ${e.message}`, e.stack);
      if (e instanceof HttpException) throw e;
      throw new HttpException(
        `Sleep plan update failed: ${e.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
