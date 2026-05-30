import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/auth.guard.js';
import { JournalService } from './journal.service.js';

@Controller('journal')
@UseGuards(SessionGuard)
export class JournalController {
  constructor(private readonly journalService: JournalService) {}

  @Post()
  async create(
    @Req() req: any,
    @Body() body: { factorTag: string; intensity: number; note?: string; timestamp?: string },
  ) {
    if (!body.factorTag || typeof body.intensity !== 'number') {
      throw new HttpException('factorTag and intensity are required', HttpStatus.BAD_REQUEST);
    }
    return this.journalService.create(req.user.userId, body);
  }

  @Get()
  async list(@Req() req: any, @Query('date') date?: string) {
    const dateStr = date ?? new Date().toISOString().slice(0, 10);
    const entries = await this.journalService.findByDate(req.user.userId, dateStr);
    return { entries };
  }

  // Mean-delta correlator (master plan §4.10). Returns per-metric impact
  // rows ranked by |delta|, with a calibrating flag when the user hasn't
  // accumulated enough tracked days.
  @Get('insights')
  async insights(@Req() req: any, @Query('windowDays') windowDays?: string) {
    const days = windowDays ? Number.parseInt(windowDays, 10) : 30;
    const safeWindow = Number.isFinite(days) && days > 0 ? Math.min(180, days) : 30;
    return this.journalService.buildInsights(req.user.userId, safeWindow);
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    const deleted = await this.journalService.remove(req.user.userId, id);
    if (!deleted) {
      throw new HttpException('Entry not found', HttpStatus.NOT_FOUND);
    }
    return { ok: true };
  }
}
