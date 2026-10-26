import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { LIMITS } from '../../../common/dto-limits.js';

/** The most projects one call can name: far more than a person belongs to. */
const MAX_PROJECTS = 200;

export class MarkSeenDto {
  /** The projects to mark as seen; all of the person's when it is left out. */
  @IsArray()
  @ArrayMaxSize(MAX_PROJECTS)
  @IsString({ each: true })
  @MaxLength(LIMITS.ID, { each: true })
  @IsOptional()
  projectIds?: string[];
}
