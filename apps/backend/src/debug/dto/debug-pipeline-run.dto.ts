import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

// Query params accepted by POST /debug/pipeline/run. All optional —
// pass none and you get the existing full 45-day recompute.
//
//   from       — window start, ISO date or YYYY-MM-DD
//   to         — window end,   same shape
//   day        — convenience: equivalent to from=YYYY-MM-DD&to=YYYY-MM-DD+1
//                Useful for the inspector's "rerun this night" button.
//   force      — bypass the watermark short-circuit (boolean, "true"|"1")
//   timeZone   — IANA zone, used to interpret `day`
//   date       — legacy param, used for the post-run overview fetch only
export class DebugPipelineRunDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z?)?$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z?)?$/)
  to?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  day?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === '1' || value === true)
  @IsBoolean()
  force?: boolean;

  @IsOptional()
  @IsString()
  timeZone?: string;

  @IsOptional()
  @IsString()
  tz?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
}
