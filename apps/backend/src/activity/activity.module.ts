import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityDetection } from './entities/activity-detection.entity.js';
import { ActivityController } from './activity.controller.js';
import { ActivityService } from './activity.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ActivityDetection])],
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [TypeOrmModule, ActivityService],
})
export class ActivityModule {}
