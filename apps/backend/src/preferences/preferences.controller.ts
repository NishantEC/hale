import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/auth.guard.js';
import { PreferencesService, type PreferencesShape } from './preferences.service.js';

@Controller('preferences')
@UseGuards(SessionGuard)
export class PreferencesController {
  constructor(private readonly preferencesService: PreferencesService) {}

  @Get()
  async get(@Req() req: any) {
    return this.preferencesService.get(req.user.userId);
  }

  @Patch()
  async patch(@Req() req: any, @Body() patch: Partial<PreferencesShape>) {
    return this.preferencesService.patch(req.user.userId, patch ?? {});
  }
}
