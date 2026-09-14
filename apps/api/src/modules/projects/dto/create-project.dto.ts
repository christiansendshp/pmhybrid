import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const ROLLUP_STRATEGIES = [
  'EQUAL_WEIGHT_AVERAGE',
  'LEAF_EQUAL_WEIGHT',
] as const;

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  repoUrl?: string;

  @IsString()
  @IsNotEmpty()
  docsPath!: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  syncIntervalMinutes?: number;

  @IsIn(ROLLUP_STRATEGIES)
  @IsOptional()
  progressRollupStrategy?: (typeof ROLLUP_STRATEGIES)[number];
}
