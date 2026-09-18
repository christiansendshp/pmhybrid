import { IsString, Matches } from 'class-validator';
import { NOT_BLANK } from './create-task.dto.js';

export class CreateTaskCommentDto {
  @IsString()
  @Matches(NOT_BLANK, { message: 'body must not be blank' })
  body!: string;
}
