import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class DeviceEventDto {
  @IsString()
  deviceId: string;

  @IsNumber()
  eventNumber: number;

  @IsString()
  eventName: string;

  @IsOptional()
  @IsString()
  rawPayload?: string | null;

  @IsDateString()
  capturedAt: string;
}

export class IngestEventsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeviceEventDto)
  events: DeviceEventDto[];
}
