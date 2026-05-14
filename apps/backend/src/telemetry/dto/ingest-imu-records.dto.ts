import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  ValidateNested,
} from 'class-validator';

class ImuRecordDto {
  @IsDateString()
  timestamp: string;

  @IsNumber()
  accelX: number;

  @IsNumber()
  accelY: number;

  @IsNumber()
  accelZ: number;

  @IsNumber()
  gyroX: number;

  @IsNumber()
  gyroY: number;

  @IsNumber()
  gyroZ: number;

  @IsOptional()
  @IsIn(['realtime', 'historical'])
  source?: 'realtime' | 'historical';
}

export class IngestImuRecordsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImuRecordDto)
  records: ImuRecordDto[];
}
