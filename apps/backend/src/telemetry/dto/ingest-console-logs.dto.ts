import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsString, ValidateNested } from 'class-validator';

class ConsoleLogDto {
  @IsString()
  deviceId: string;

  @IsString()
  message: string;

  @IsDateString()
  capturedAt: string;
}

export class IngestConsoleLogsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConsoleLogDto)
  logs: ConsoleLogDto[];
}
