import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { LIMITS } from '../../../common/dto-limits.js';

/** Email and password are deliberately not editable here — identity and credential changes need their own flow. */
export class UpdateUserDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(LIMITS.NAME)
  displayName?: string;

  @IsUrl({ require_tld: false })
  @IsOptional()
  @MaxLength(LIMITS.URL)
  avatarUrl?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
