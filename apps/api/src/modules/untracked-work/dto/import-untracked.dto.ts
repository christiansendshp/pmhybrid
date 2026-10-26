import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsString,
  MaxLength,
} from 'class-validator';
import { LIMITS } from '../../../common/dto-limits.js';

export class ImportUntrackedDto {
  /** The IDs, as `GET /projects/:id/documents/agentslog/untracked` lists them. */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(LIMITS.LIST)
  @IsString({ each: true })
  @MaxLength(LIMITS.ID, { each: true })
  ids!: string[];
}
