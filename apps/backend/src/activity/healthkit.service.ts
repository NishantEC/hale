import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';

import { HealthkitDailySummary } from './entities/healthkit-daily-summary.entity.js';
import { HealthkitWorkout } from './entities/healthkit-workout.entity.js';
import { BarometerSample } from './entities/barometer-sample.entity.js';
import { MotionActivitySample } from './entities/motion-activity-sample.entity.js';
import {
  HealthkitSyncDto,
  BarometerSyncDto,
  MotionActivitySyncDto,
} from './dto/healthkit-sync.dto.js';

@Injectable()
export class HealthkitService {
  private readonly logger = new Logger(HealthkitService.name);

  constructor(
    @InjectRepository(HealthkitDailySummary)
    private readonly summaryRepo: Repository<HealthkitDailySummary>,
    @InjectRepository(HealthkitWorkout)
    private readonly workoutRepo: Repository<HealthkitWorkout>,
    @InjectRepository(BarometerSample)
    private readonly barometerRepo: Repository<BarometerSample>,
    @InjectRepository(MotionActivitySample)
    private readonly motionActivityRepo: Repository<MotionActivitySample>,
  ) {}

  async sync(userId: string, dto: HealthkitSyncDto) {
    const summariesUpserted = await this.upsertSummaries(userId, dto.summaries ?? []);
    const workoutsUpserted = await this.upsertWorkouts(userId, dto.workouts ?? []);
    return { summariesUpserted, workoutsUpserted };
  }

  private async upsertSummaries(
    userId: string,
    summaries: NonNullable<HealthkitSyncDto['summaries']>,
  ): Promise<number> {
    if (summaries.length === 0) return 0;
    const entities = summaries.map((s) => {
      const e = new HealthkitDailySummary();
      e.userId = userId;
      e.dayDate = s.dayDate;
      e.steps = s.steps ?? null;
      e.activeEnergyKcal = s.activeEnergyKcal ?? null;
      e.exerciseMinutes = s.exerciseMinutes ?? null;
      e.standMinutes = s.standMinutes ?? null;
      e.walkingDistanceMeters = s.walkingDistanceMeters ?? null;
      e.flightsClimbed = s.flightsClimbed ?? null;
      e.restingHeartRate = s.restingHeartRate ?? null;
      e.hrvSdnnMs = s.hrvSdnnMs ?? null;
      e.oxygenSaturationAverage = s.oxygenSaturationAverage ?? null;
      e.respiratoryRateAverage = s.respiratoryRateAverage ?? null;
      return e;
    });
    await this.summaryRepo
      .createQueryBuilder()
      .insert()
      .values(entities)
      .orUpdate(
        [
          'steps',
          'activeEnergyKcal',
          'exerciseMinutes',
          'standMinutes',
          'walkingDistanceMeters',
          'flightsClimbed',
          'restingHeartRate',
          'hrvSdnnMs',
          'oxygenSaturationAverage',
          'respiratoryRateAverage',
          'updatedAt',
        ],
        ['userId', 'dayDate'],
      )
      .execute();
    return entities.length;
  }

  private async upsertWorkouts(
    userId: string,
    workouts: NonNullable<HealthkitSyncDto['workouts']>,
  ): Promise<number> {
    if (workouts.length === 0) return 0;
    const entities = workouts.map((w) => {
      const e = new HealthkitWorkout();
      e.userId = userId;
      e.uuid = w.uuid;
      e.activityName = w.activityName;
      e.startTime = new Date(w.startDate);
      e.endTime = new Date(w.endDate);
      e.durationMinutes = w.durationMinutes;
      e.totalEnergyKcal = w.totalEnergyKcal ?? null;
      e.totalDistanceMeters = w.totalDistanceMeters ?? null;
      e.averageHeartRate = w.averageHeartRate ?? null;
      e.appleSource = w.source ?? null;
      return e;
    });
    await this.workoutRepo
      .createQueryBuilder()
      .insert()
      .values(entities)
      .orUpdate(
        [
          'activityName',
          'startTime',
          'endTime',
          'durationMinutes',
          'totalEnergyKcal',
          'totalDistanceMeters',
          'averageHeartRate',
          'appleSource',
          'updatedAt',
        ],
        ['userId', 'uuid'],
      )
      .execute();
    return entities.length;
  }

  async findSummaryForDate(userId: string, dayDate: string): Promise<HealthkitDailySummary | null> {
    return this.summaryRepo.findOne({ where: { userId, dayDate } });
  }

  async findWorkoutsBetween(userId: string, start: Date, end: Date): Promise<HealthkitWorkout[]> {
    return this.workoutRepo.find({
      where: { userId, startTime: Between(start, end) },
      order: { startTime: 'ASC' },
    });
  }

  async ingestBarometer(userId: string, dto: BarometerSyncDto): Promise<number> {
    if (dto.samples.length === 0) return 0;
    const entities = dto.samples.map((s) => {
      const e = new BarometerSample();
      e.userId = userId;
      e.timestamp = new Date(s.timestamp);
      e.pressureHpa = s.pressureHpa;
      e.relativeAltitudeMeters = s.relativeAltitudeMeters ?? null;
      return e;
    });
    await this.barometerRepo.save(entities, { chunk: 500 });
    return entities.length;
  }

  async ingestMotionActivity(userId: string, dto: MotionActivitySyncDto): Promise<number> {
    if (dto.samples.length === 0) return 0;
    const entities = dto.samples.map((s) => {
      const e = new MotionActivitySample();
      e.userId = userId;
      e.timestamp = new Date(s.timestamp);
      e.activity = s.activity;
      e.confidence = s.confidence;
      return e;
    });
    await this.motionActivityRepo.save(entities, { chunk: 500 });
    return entities.length;
  }
}
