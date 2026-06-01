import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/auth.guard.js';
import { ActivityService } from './activity.service.js';

@Controller('activities')
@UseGuards(SessionGuard)
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get()
  async list(@Req() req: any, @Query('date') date?: string) {
    const d = date ?? new Date().toISOString().slice(0, 10);
    const activities = await this.activityService.findByDate(req.user.userId, d);
    return {
      date: d,
      activities: activities.map((a) => ({
        id: a.id,
        activityType: a.activityType,
        startTime: a.startTime.toISOString(),
        endTime: a.endTime.toISOString(),
        durationMinutes: a.durationMinutes,
        intensity: a.intensity,
        confidence: a.confidence,
        heartRateAvg: a.heartRateAvg,
        heartRateMax: a.heartRateMax,
        strainScore: a.strainScore,
        cadenceHz: a.cadenceHz,
        source: a.source,
      })),
    };
  }

  @Get(':id')
  async getOne(@Req() req: any, @Param('id') id: string) {
    const bout = await this.activityService.getBoutDetail(req.user.userId, id);
    if (!bout) throw new NotFoundException('Activity not found');
    return bout;
  }

  @Post()
  async create(@Req() req: any, @Body() body: {
    activityType: string;
    startTime: string;
    endTime: string;
    intensity?: string;
  }) {
    const activity = await this.activityService.create(req.user.userId, body);
    return { ok: true, id: activity.id };
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.activityService.remove(req.user.userId, id);
  }

  @Post(':id/confirm')
  async confirm(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { confirmedType?: string },
  ) {
    return this.activityService.confirm(req.user.userId, id, body.confirmedType);
  }

  @Post(':id/dismiss')
  async dismiss(@Req() req: any, @Param('id') id: string) {
    return this.activityService.dismiss(req.user.userId, id);
  }
}
