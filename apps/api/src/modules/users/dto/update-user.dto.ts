import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

/** Email and password are deliberately not editable here — identity and credential changes need their own flow. */
export class UpdateUserDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  displayName?: string;

  @IsUrl({ require_tld: false })
  @IsOptional()
  avatarUrl?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
