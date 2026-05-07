import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class RealtimeSampleDto {
  @IsString()
  deviceId: string;

  @IsString()
  sessionId: string;

  @IsIn(['hr', 'raw'])
  dataType: 'hr' | 'raw';

  @IsOptional()
  @IsNumber()
  heartRate?: number | null;

  @IsOptional()
  @IsObject()
  rawFields?: Record<string, any> | null;

  @IsOptional()
  @IsString()
  rawPayload?: string | null;

  @IsDateString()
  capturedAt: string;
}

export class IngestRealtimeDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RealtimeSampleDto)
  samples: RealtimeSampleDto[];
}
