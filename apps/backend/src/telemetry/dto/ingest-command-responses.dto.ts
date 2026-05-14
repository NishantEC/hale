import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class CommandResponseDto {
  @IsString()
  deviceId: string;

  @IsNumber()
  command: number;

  @IsString()
  commandName: string;

  @IsNumber()
  sequence: number;

  @IsOptional()
  @IsString()
  rawPayload?: string | null;

  @IsDateString()
  capturedAt: string;
}

export class IngestCommandResponsesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommandResponseDto)
  responses: CommandResponseDto[];
}
