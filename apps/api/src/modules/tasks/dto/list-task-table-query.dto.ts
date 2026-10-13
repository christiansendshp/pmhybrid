import { TaskPriority } from '@pmhybrid/shared-types';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LIMITS } from '../../../common/dto-limits.js';
import { MAX_PAGE_SIZE } from '../../../common/pagination.js';

/** The columns the table of tasks can be ordered by (Roadmap TASK-18). */
export const TASK_TABLE_SORTS = [
  'externalId',
  'title',
  'status',
  'assignee',
  'reviewer',
  'priority',
  'age',
  'dueDate',
  'updatedAt',
  'createdAt',
] as const;
export type TaskTableSort = (typeof TASK_TABLE_SORTS)[number];

/** The value a flag takes in an address: `1` or `true`. Anything else is off, not an error, like the board's own address. */
const flag = Transform(({ value }: { value: unknown }) =>
  value === '1' || value === 'true' || value === true ? true : undefined,
);

/**
 * What the table of tasks is asked for: the same filters as the board (Roadmap TASK-16, TASK-18),
 * the column to order by, and the page. The answer is ordered and cut on the server, so the order
 * holds across pages.
 */
export class ListTaskTableQueryDto {
  /** Title or Roadmap ID contains this, whatever the case. */
  @IsString()
  @IsOptional()
  @MaxLength(LIMITS.TITLE)
  q?: string;

  /** An actor id, or `__unassigned__` for the tasks nobody holds. */
  @IsString()
  @IsOptional()
  @MaxLength(LIMITS.ID)
  assignee?: string;

  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @IsString()
  @IsOptional()
  @MaxLength(LIMITS.ID)
  phase?: string;

  @IsString()
  @IsOptional()
  @MaxLength(LIMITS.ID)
  epic?: string;

  @flag
  @IsBoolean()
  @IsOptional()
  blocked?: boolean;

  /** Only the unfinished tasks that have not moved for more than this many hours. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8760)
  @IsOptional()
  stale?: number;

  @IsIn(['HUMAN', 'AI_AGENT'])
  @IsOptional()
  kind?: 'HUMAN' | 'AI_AGENT';

  @IsString()
  @IsOptional()
  @MaxLength(LIMITS.ID)
  reviewer?: string;

  @flag
  @IsBoolean()
  @IsOptional()
  divergent?: boolean;

  @flag
  @IsBoolean()
  @IsOptional()
  instant?: boolean;

  @IsIn(TASK_TABLE_SORTS)
  @IsOptional()
  sort?: TaskTableSort;

  @IsIn(['asc', 'desc'])
  @IsOptional()
  dir?: 'asc' | 'desc';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  @IsOptional()
  limit?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number;
}
