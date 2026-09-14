import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  /** Hierarchy links — none mandatory (brief §5); if set, must exist in the same project. */
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

  @IsString()
  @IsOptional()
  priority?: string;

  @IsString()
  @IsOptional()
  acceptanceCriteria?: string;

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
