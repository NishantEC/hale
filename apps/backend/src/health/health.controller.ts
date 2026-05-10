import {
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
import { HealthAssessmentService } from './health-assessment.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

@Controller()
@UseGuards(SessionGuard)
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly healthService: HealthAssessmentService) {}

  /** Latest assessment + 12-week history for the Health tab. */
  @Get('views/health')
  async healthView(@Req() req: any, @Query('week') week?: string) {
    try {
      const userId = req.user.userId;
      const referenceDate = week ? new Date(`${week}T00:00:00.000Z`) : new Date();
      // Always recompute the current week so freshly-ingested data shows up.
      const current = await this.healthService.computeWeekly(userId, referenceDate);
      const history = await this.healthService.getHistory(userId, 12);
      const profile = await this.healthService.getProfile(userId);

      return {
        current,
        history,
        profile: profile
          ? {
              dateOfBirth: profile.dateOfBirth,
              biologicalSex: profile.biologicalSex,
              heightCm: profile.heightCm,
              weightKg: profile.weightKg,
            }
          : null,
        needsDateOfBirth: !profile?.dateOfBirth,
      };
    } catch (e) {
      this.logger.error(`health view failed: ${e.message}`, e.stack);
      throw new HttpException(`Health view failed: ${e.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('profile')
  async getProfile(@Req() req: any) {
    try {
      const profile = await this.healthService.getProfile(req.user.userId);
      return {
        dateOfBirth: profile?.dateOfBirth ?? null,
        biologicalSex: profile?.biologicalSex ?? null,
        heightCm: profile?.heightCm ?? null,
        weightKg: profile?.weightKg ?? null,
      };
    } catch (e) {
      this.logger.error(`profile read failed: ${e.message}`, e.stack);
      throw new HttpException(`Profile read failed: ${e.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put('profile')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async updateProfile(@Req() req: any, @Body() dto: UpdateProfileDto) {
    try {
      const profile = await this.healthService.setProfile(req.user.userId, dto);
      return {
        dateOfBirth: profile.dateOfBirth,
        biologicalSex: profile.biologicalSex,
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
      };
    } catch (e) {
      this.logger.error(`profile update failed: ${e.message}`, e.stack);
      throw new HttpException(`Profile update failed: ${e.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
