import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { TaskStatus } from '@pmhybrid/shared-types';
import { LIMITS } from '../../../common/dto-limits.js';

export class TransitionTaskDto {
  @IsEnum(TaskStatus)
  status!: TaskStatus;

  /** Who is asked to review the task, only with the move to QA (Roadmap SUBTASK-09.1); null or absent for nobody. */
  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.ID)
  reviewerActorId?: string | null;

  /**
   * What the person says with a move to QA (the handoff) or a move back from it (why it goes back), written
   * into the ledger of a project that records the QA handoff (Roadmap TASK-08); absent for nothing to say.
   */
  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.NOTE)
  note?: string;
}
