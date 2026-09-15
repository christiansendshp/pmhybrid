import { TaskPriority } from '@pmhybrid/shared-types';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

/** At least one non-whitespace character. */
export const NOT_BLANK = /\S/;

/**
 * Brief §9: an app-created task is never incomplete — its Roadmap row needs
 * both an Outcome (title) and an Acceptance check. Hierarchy links stay
 * optional (brief §5, BR-006); the UI asks for the parent instance explicitly.
 */
export class CreateTaskDto {
  @IsString()
  @Matches(NOT_BLANK, { message: 'title must not be blank' })
  title!: string;

  @IsString()
  @Matches(NOT_BLANK, { message: 'acceptanceCriteria must not be blank' })
  acceptanceCriteria!: string;

  @IsString()
  @IsOptional()
  description?: string;

  /** Hierarchy links — none mandatory (brief §5); if set, they must exist in the same project and agree with each other. */
  @IsString()
  @IsOptional()
  phaseId?: string;

  @IsString()
  @IsOptional()
  epicId?: string;

  @IsString()
  @IsOptional()
  templateId?: string;

  @IsString()
  @IsOptional()
  parentTaskId?: string;

  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  estimatedDate?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  /** Explicit leaf-level override; rollup computation takes over once a task has subtasks. */
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  progressPercent?: number;
}
