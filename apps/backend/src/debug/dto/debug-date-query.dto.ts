import { IsOptional, Matches } from 'class-validator';

export class DebugDateQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
}
