import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AuditOrigin } from '@prisma/client';
import { LIMITS } from '../../../common/dto-limits.js';

/**
 * Filters for a project's audit trail (brief §25). `cursor` is the id of the
 * last event already seen — pages go backwards in time, exactly, even when
 * several events share one timestamp.
 */
export class AuditQueryDto {
  @IsString()
  @IsOptional()
  @MaxLength(LIMITS.LABEL)
  entityType?: string;

  @IsString()
  @IsOptional()
  @MaxLength(LIMITS.ID)
  entityId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(LIMITS.LABEL)
  operation?: string;

  @IsEnum(AuditOrigin)
  @IsOptional()
  origin?: AuditOrigin;

  @IsString()
  @IsOptional()
  @MaxLength(LIMITS.TOKEN)
  cursor?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  limit?: number;
}
