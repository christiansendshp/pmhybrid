import { TaskStatus } from '@pmhybrid/shared-types';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LIMITS } from '../../../common/dto-limits.js';
import { MAX_PAGE_SIZE } from '../../../common/pagination.js';

/**
 * Filters of the task list. Read straight off `@Query('status')` before, so
 * `?status=BOGUS` reached Prisma as an invalid enum and answered 500
 * (Roadmap IMPROVEMENT-01b); now it is a 400 that names the field.
 */
export class ListTasksQueryDto {
  @IsString()
  @IsOptional()
  @MaxLength(LIMITS.ID)
  phaseId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(LIMITS.ID)
  epicId?: string;

  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @IsString()
  @IsOptional()
  @MaxLength(LIMITS.ID)
  assigneeActorId?: string;

  /** How many tasks to return at most (Roadmap IMPROVEMENT-01d3); the default is the maximum. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  @IsOptional()
  limit?: number;

  /** Where the page after the one just read starts: the `X-Next-Cursor` header of that page. */
  @IsString()
  @IsOptional()
  @MaxLength(LIMITS.ID)
  cursor?: string;
}
