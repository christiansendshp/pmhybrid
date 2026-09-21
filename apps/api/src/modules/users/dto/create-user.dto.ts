import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { LIMITS } from '../../../common/dto-limits.js';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.NAME)
  displayName!: string;

  @IsEmail()
  @MaxLength(LIMITS.EMAIL)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(LIMITS.PASSWORD)
  password!: string;

  @IsUrl({ require_tld: false })
  @IsOptional()
  @MaxLength(LIMITS.URL)
  avatarUrl?: string;
}
