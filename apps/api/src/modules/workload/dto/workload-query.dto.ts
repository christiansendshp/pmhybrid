import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { TaskStatus } from '@pmhybrid/shared-types';
import { LIMITS } from '../../../common/dto-limits.js';

const ACTOR_KINDS = ['HUMAN', 'AI_AGENT'] as const;

/** Brief §18 filters: proyecto, usuario / agente (actorId, kind), estado, fase, epic. */
export class WorkloadQueryDto {
  @IsString()
  @IsOptional()
  @MaxLength(LIMITS.ID)
  projectId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(LIMITS.ID)
  actorId?: string;

  /** People (HUMAN) or agents (AI_AGENT) only. */
  @IsIn(ACTOR_KINDS)
  @IsOptional()
  kind?: (typeof ACTOR_KINDS)[number];

  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @IsString()
  @IsOptional()
  @MaxLength(LIMITS.ID)
  phaseId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(LIMITS.ID)
  epicId?: string;
}
