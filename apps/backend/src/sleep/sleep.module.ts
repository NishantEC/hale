import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SleepDetection } from './entities/sleep-detection.entity.js';
import { SleepStage } from './entities/sleep-stage.entity.js';
import { NightFeature } from './entities/night-feature.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([SleepDetection, SleepStage, NightFeature])],
  exports: [TypeOrmModule],
})
export class SleepModule {}
