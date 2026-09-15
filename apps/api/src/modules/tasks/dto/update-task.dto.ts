import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsString, Matches, ValidateIf } from 'class-validator';
import { CreateTaskDto, NOT_BLANK } from './create-task.dto.js';

/**
 * status and assigneeActorId are intentionally excluded — see /transition and
 * /assign. Optional fields are cleared with `null`; the Roadmap-backed title
 * and acceptanceCriteria can change but never be cleared (brief §9).
 */
export class UpdateTaskDto extends PartialType(
  OmitType(CreateTaskDto, ['title', 'acceptanceCriteria'] as const),
) {
  @ValidateIf((_: UpdateTaskDto, value: unknown) => value !== undefined)
  @IsString()
  @Matches(NOT_BLANK, { message: 'title must not be blank' })
  title?: string;

  @ValidateIf((_: UpdateTaskDto, value: unknown) => value !== undefined)
  @IsString()
  @Matches(NOT_BLANK, { message: 'acceptanceCriteria must not be blank' })
  acceptanceCriteria?: string;
}
