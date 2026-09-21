import { IsOptional, IsString, MaxLength } from 'class-validator';
import { LIMITS } from '../../../common/dto-limits.js';

export class BrowseDirectoryQueryDto {
  @IsString()
  @IsOptional()
  @MaxLength(LIMITS.PATH)
  path?: string;
}
