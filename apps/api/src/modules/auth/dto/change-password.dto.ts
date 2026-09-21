import { IsString, MaxLength, MinLength } from 'class-validator';
import { LIMITS } from '../../../common/dto-limits.js';

/** Changing one's own password (Roadmap SECURITY-04a): the current one proves it is the owner at the keyboard. */
export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(LIMITS.PASSWORD)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(LIMITS.PASSWORD)
  newPassword!: string;
}
