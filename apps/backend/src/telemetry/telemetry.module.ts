import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceEvent } from './entities/device-event.entity.js';
import { RealtimeSample } from './entities/realtime-sample.entity.js';
import { ConsoleLog } from './entities/console-log.entity.js';
import { CommandResponse } from './entities/command-response.entity.js';
import { ImuRecord } from '../pipeline/entities/imu-record.entity.js';
import { TelemetryService } from './telemetry.service.js';
import { TelemetryController } from './telemetry.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([DeviceEvent, RealtimeSample, ConsoleLog, CommandResponse, ImuRecord])],
  controllers: [TelemetryController],
  providers: [TelemetryService],
  exports: [TypeOrmModule, TelemetryService],
})
export class TelemetryModule {}
