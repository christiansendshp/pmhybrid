import { TaskStatus } from '@pmhybrid/shared-types';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { LIMITS } from '../../../common/dto-limits.js';

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
}
