import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { LIMITS } from '../../../common/dto-limits.js';

export class AddMemberDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.ID)
  actorId!: string;
}
