import { IsDateString, IsIn, IsOptional, Max, Min } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsIn(['male', 'female', 'other'])
  biologicalSex?: 'male' | 'female' | 'other';

  @IsOptional()
  @Min(50)
  @Max(250)
  heightCm?: number;

  @IsOptional()
  @Min(20)
  @Max(300)
  weightKg?: number;
}
