import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export class UpdateSleepPlanDto {
  @IsInt()
  @Min(360)
  @Max(600)
  targetSleepMinutes: number;

  @IsInt()
  @Min(0)
  @Max(1439)
  wakeMinutes: number;

  @IsBoolean()
  alarmEnabled: boolean;

  @IsInt()
  @Min(0)
  @Max(1439)
  alarmMinutes: number;

  @IsBoolean()
  smartWakeEnabled: boolean;
}
