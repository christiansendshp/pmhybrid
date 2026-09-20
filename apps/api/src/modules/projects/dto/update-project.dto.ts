import { OmitType, PartialType } from '@nestjs/mapped-types';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';
import { CreateProjectDto, ROLLUP_STRATEGIES } from './create-project.dto.js';

/** ACTIVE projects are synced on their schedule; PAUSED and ARCHIVED ones are not. */
export const PROJECT_STATUSES = ['ACTIVE', 'PAUSED', 'ARCHIVED'] as const;

const NOT_BLANK = /\S/;
const provided = (_: UpdateProjectDto, value: unknown) => value !== undefined;

/**
 * Project settings. Description, repository URL and leadActorId (Roadmap
 * GAP-32 — the project's single responsible member, human or AI agent) are
 * cleared with `null`; the name, docs path, sync interval and rollup
 * strategy can change but never be cleared.
 */
export class UpdateProjectDto extends PartialType(
  OmitType(CreateProjectDto, [
    'name',
    'docsPath',
    'syncIntervalMinutes',
    'progressRollupStrategy',
  ] as const),
) {
  @IsString()
  @IsOptional()
  leadActorId?: string | null;

  @ValidateIf(provided)
  @IsString()
  @Matches(NOT_BLANK, { message: 'name must not be blank' })
  name?: string;

  @ValidateIf(provided)
  @IsString()
  @Matches(NOT_BLANK, { message: 'docsPath must not be blank' })
  docsPath?: string;

  @ValidateIf(provided)
  @IsInt()
  @Min(1)
  syncIntervalMinutes?: number;

  @ValidateIf(provided)
  @IsIn(ROLLUP_STRATEGIES)
  progressRollupStrategy?: (typeof ROLLUP_STRATEGIES)[number];

  @IsIn(PROJECT_STATUSES)
  @IsOptional()
  status?: (typeof PROJECT_STATUSES)[number];
}
