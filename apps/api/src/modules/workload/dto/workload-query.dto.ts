import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { TaskStatus } from '@pmhybrid/shared-types';

const ACTOR_KINDS = ['HUMAN', 'AI_AGENT'] as const;

/** Brief §18 filters: proyecto, usuario / agente (actorId, kind), estado, fase, epic. */
export class WorkloadQueryDto {
  @IsString()
  @IsOptional()
  projectId?: string;

  @IsString()
  @IsOptional()
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
  phaseId?: string;

  @IsString()
  @IsOptional()
  epicId?: string;
}
