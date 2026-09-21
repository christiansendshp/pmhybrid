import { IsString, MaxLength } from 'class-validator';
import { LIMITS } from '../../../common/dto-limits.js';

export class RefreshDto {
  @IsString()
  @MaxLength(LIMITS.TOKEN)
  refreshToken!: string;
}
