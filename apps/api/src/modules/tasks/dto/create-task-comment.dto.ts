import { IsString, Matches, MaxLength } from 'class-validator';
import { NOT_BLANK } from './create-task.dto.js';
import { LIMITS } from '../../../common/dto-limits.js';

export class CreateTaskCommentDto {
  @IsString()
  @Matches(NOT_BLANK, { message: 'body must not be blank' })
  @MaxLength(LIMITS.COMMENT)
  body!: string;
}
