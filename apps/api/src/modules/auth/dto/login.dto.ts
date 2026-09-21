import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { LIMITS } from '../../../common/dto-limits.js';

export class LoginDto {
  @IsEmail()
  @MaxLength(LIMITS.EMAIL)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(LIMITS.PASSWORD)
  password!: string;
}
