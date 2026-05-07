import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SleepPlan } from './sleep-plan.entity.js';
import { BaselineProfile } from './baseline-profile.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([SleepPlan, BaselineProfile])],
  exports: [TypeOrmModule],
})
export class PlansModule {}
