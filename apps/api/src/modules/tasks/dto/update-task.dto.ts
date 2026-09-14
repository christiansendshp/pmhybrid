import { PartialType } from '@nestjs/mapped-types';
import { CreateTaskDto } from './create-task.dto.js';

/** status and assigneeActorId are intentionally excluded — see /transition and /assign. */
export class UpdateTaskDto extends PartialType(CreateTaskDto) {}
