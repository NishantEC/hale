import { Type } from 'class-transformer';
import { IsArray, IsISO8601, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

export class HealthkitDailySummaryDto {
  @IsString()
  dayDate: string; // YYYY-MM-DD

  @IsOptional()
  @IsNumber()
  steps?: number | null;

  @IsOptional()
  @IsNumber()
  activeEnergyKcal?: number | null;

  @IsOptional()
  @IsNumber()
  exerciseMinutes?: number | null;

  @IsOptional()
  @IsNumber()
  standMinutes?: number | null;

  @IsOptional()
  @IsNumber()
  walkingDistanceMeters?: number | null;

  @IsOptional()
  @IsNumber()
  flightsClimbed?: number | null;

  @IsOptional()
  @IsNumber()
  restingHeartRate?: number | null;

  @IsOptional()
  @IsNumber()
  hrvSdnnMs?: number | null;

  @IsOptional()
  @IsNumber()
  oxygenSaturationAverage?: number | null;

  @IsOptional()
  @IsNumber()
  respiratoryRateAverage?: number | null;
}

export class HealthkitWorkoutDto {
  @IsString()
  uuid: string;

  @IsString()
  activityName: string;

  @IsISO8601()
  startDate: string;

  @IsISO8601()
  endDate: string;

  @IsNumber()
  durationMinutes: number;

  @IsOptional()
  @IsNumber()
  totalEnergyKcal?: number | null;

  @IsOptional()
  @IsNumber()
  totalDistanceMeters?: number | null;

  @IsOptional()
  @IsNumber()
  averageHeartRate?: number | null;

  @IsOptional()
  @IsString()
  source?: string | null;
}

export class HealthkitSyncDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HealthkitDailySummaryDto)
  summaries?: HealthkitDailySummaryDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HealthkitWorkoutDto)
  workouts?: HealthkitWorkoutDto[];
}

export class BarometerSampleDto {
  @IsISO8601()
  timestamp: string;

  @IsNumber()
  pressureHpa: number;

  @IsOptional()
  @IsNumber()
  relativeAltitudeMeters?: number | null;
}

export class BarometerSyncDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BarometerSampleDto)
  samples: BarometerSampleDto[];
}

export class MotionActivitySampleDto {
  @IsISO8601()
  timestamp: string;

  @IsString()
  activity: string;

  @IsString()
  confidence: string;
}

export class MotionActivitySyncDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MotionActivitySampleDto)
  samples: MotionActivitySampleDto[];
}
