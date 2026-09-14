import { IsEnum } from 'class-validator';
import { TaskStatus } from '@pmhybrid/shared-types';

export class TransitionTaskDto {
  @IsEnum(TaskStatus)
  status!: TaskStatus;
}
