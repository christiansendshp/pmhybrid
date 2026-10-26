import { OmitType, PartialType } from '@nestjs/mapped-types';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { CreateProjectDto, ROLLUP_STRATEGIES } from './create-project.dto.js';
import { LIMITS } from '../../../common/dto-limits.js';
import { MAX_INSTANT_CLOSE_MINUTES } from '../../tasks/instant-close.util.js';

/** ACTIVE projects are synced on their schedule; PAUSED and ARCHIVED ones are not. */
export const PROJECT_STATUSES = ['ACTIVE', 'PAUSED', 'ARCHIVED'] as const;

const NOT_BLANK = /\S/;
const provided = (_: UpdateProjectDto, value: unknown) => value !== undefined;
/** A limit is validated when it is given, and `null` (or nothing) is allowed: it clears it. */
const limitGiven = (_: UpdateProjectDto, value: unknown) =>
  value !== undefined && value !== null;
/** The most a limit can be. */
export const MAX_WIP_LIMIT = 999;

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
  @MaxLength(LIMITS.ID)
  leadActorId?: string | null;

  @ValidateIf(provided)
  @IsString()
  @Matches(NOT_BLANK, { message: 'name must not be blank' })
  @MaxLength(LIMITS.NAME)
  name?: string;

  @ValidateIf(provided)
  @IsString()
  @Matches(NOT_BLANK, { message: 'docsPath must not be blank' })
  @MaxLength(LIMITS.PATH)
  docsPath?: string;

  @ValidateIf(provided)
  @IsInt()
  @Min(1)
  syncIntervalMinutes?: number;

  /** Minutes between a task's first IN_PROGRESS and its DONE under which it is an instant close (Roadmap TASK-12). */
  @ValidateIf(provided)
  @IsInt()
  @Min(1)
  @Max(MAX_INSTANT_CLOSE_MINUTES)
  instantCloseMinutes?: number;

  /** Whether a move to QA needs an independent reviewer who can approve, and a document cannot close a task in QA (Roadmap SUBTASK-09.2). */
  @ValidateIf(provided)
  @IsBoolean()
  qaApprovalRequired?: boolean;

  /** Advisory limits on the work in progress, 1 to 999; null clears one (Roadmap TASK-15). */
  @ValidateIf(limitGiven)
  @IsInt()
  @Min(1)
  @Max(MAX_WIP_LIMIT)
  wipLimitDevelopment?: number | null;

  @ValidateIf(limitGiven)
  @IsInt()
  @Min(1)
  @Max(MAX_WIP_LIMIT)
  wipLimitQa?: number | null;

  @ValidateIf(limitGiven)
  @IsInt()
  @Min(1)
  @Max(MAX_WIP_LIMIT)
  wipLimitAgent?: number | null;

  @ValidateIf(provided)
  @IsIn(ROLLUP_STRATEGIES)
  progressRollupStrategy?: (typeof ROLLUP_STRATEGIES)[number];

  @IsIn(PROJECT_STATUSES)
  @IsOptional()
  status?: (typeof PROJECT_STATUSES)[number];
}
