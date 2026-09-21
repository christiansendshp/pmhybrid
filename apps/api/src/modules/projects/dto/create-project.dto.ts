import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { LIMITS } from '../../../common/dto-limits.js';

export const ROLLUP_STRATEGIES = [
  'EQUAL_WEIGHT_AVERAGE',
  'LEAF_EQUAL_WEIGHT',
] as const;

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.NAME)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(LIMITS.TEXT)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(LIMITS.URL)
  repoUrl?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.PATH)
  docsPath!: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  syncIntervalMinutes?: number;

  @IsIn(ROLLUP_STRATEGIES)
  @IsOptional()
  progressRollupStrategy?: (typeof ROLLUP_STRATEGIES)[number];
}
