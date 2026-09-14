import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TaskStatus } from '@pmhybrid/shared-types';

/** Brief §18 filters: proyecto, usuario/agente (actorId), estado, fase, epic. */
export class WorkloadQueryDto {
  @IsString()
  @IsOptional()
  projectId?: string;

  @IsString()
  @IsOptional()
  actorId?: string;

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
