import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { LIMITS } from '../../../common/dto-limits.js';

export class CreatePhaseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.NAME)
  name!: string;

  @IsInt()
  order!: number;

  @IsString()
  @IsOptional()
  @MaxLength(LIMITS.TEXT)
  description?: string;
}
