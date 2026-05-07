import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class SignalSampleDto {
  @IsDateString()
  timestamp: string;

  @IsString()
  source: string;

  @IsNumber()
  heartRate: number;

  @IsOptional()
  @IsNumber()
  ibiMs: number | null;

  @IsOptional()
  @IsNumber()
  motionScore: number | null;

  @IsNumber()
  qualityScore: number;
}

class HistoricalSensorRecordDto {
  @IsDateString()
  timestamp: string;

  @IsNumber()
  heartRate: number;

  @IsOptional()
  @IsNumber()
  rrAverageMs: number | null;

  @IsOptional()
  @IsNumber()
  spo2Red: number | null;

  @IsOptional()
  @IsNumber()
  spo2IR: number | null;

  @IsOptional()
  @IsNumber()
  skinTempRaw: number | null;

  @IsOptional()
  @IsNumber()
  gravityMagnitude: number | null;

  @IsOptional()
  @IsNumber()
  gravityX: number | null;

  @IsOptional()
  @IsNumber()
  gravityY: number | null;

  @IsOptional()
  @IsNumber()
  gravityZ: number | null;

  @IsOptional()
  @IsNumber()
  respRateRaw: number | null;

  @IsOptional()
  @IsBoolean()
  skinContact: boolean | null;

  @IsOptional()
  @IsNumber()
  ppgGreen: number | null;

  @IsOptional()
  @IsNumber()
  ppgRedIr: number | null;

  @IsOptional()
  @IsNumber()
  ambientLight: number | null;

  @IsOptional()
  @IsNumber()
  ledDrive1: number | null;

  @IsOptional()
  @IsNumber()
  ledDrive2: number | null;

  @IsOptional()
  @IsNumber()
  signalQuality: number | null;
}

export class IngestDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SignalSampleDto)
  signalSamples?: SignalSampleDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HistoricalSensorRecordDto)
  historicalSensorRecords?: HistoricalSensorRecordDto[];
}
