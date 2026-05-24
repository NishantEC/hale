import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database.config.js';
import { AuthModule } from './auth/auth.module.js';
import { SleepModule } from './sleep/sleep.module.js';
import { WellnessModule } from './wellness/wellness.module.js';
import { JournalModule } from './journal/journal.module.js';
import { PlansModule } from './plans/plans.module.js';
import { DevicesModule } from './devices/devices.module.js';
import { SyncModule } from './sync/sync.module.js';
import { PipelineModule } from './pipeline/pipeline.module.js';
import { ViewsModule } from './views/views.module.js';
import { DebugModule } from './debug/debug.module.js';
import { TelemetryModule } from './telemetry/telemetry.module.js';
import { ActivityModule } from './activity/activity.module.js';
import { HealthModule } from './health/health.module.js';
import { LivenessModule } from './liveness/liveness.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot(databaseConfig()),
    AuthModule,
    SleepModule,
    WellnessModule,
    JournalModule,
    PlansModule,
    DevicesModule,
    SyncModule,
    PipelineModule,
    TelemetryModule,
    ActivityModule,
    ViewsModule,
    HealthModule,
    LivenessModule,
    DebugModule,
  ],
})
export class AppModule {}
