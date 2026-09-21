import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { LIMITS } from '../../../common/dto-limits.js';

export class AssignRoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.ID)
  actorId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.ID)
  roleId!: string;
}
