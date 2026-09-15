import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AuditOrigin } from '@prisma/client';

/**
 * Filters for a project's audit trail (brief §25). `cursor` is the id of the
 * last event already seen — pages go backwards in time, exactly, even when
 * several events share one timestamp.
 */
export class AuditQueryDto {
  @IsString()
  @IsOptional()
  entityType?: string;

  @IsString()
  @IsOptional()
  entityId?: string;

  @IsString()
  @IsOptional()
  operation?: string;

  @IsEnum(AuditOrigin)
  @IsOptional()
  origin?: AuditOrigin;

  @IsString()
  @IsOptional()
  cursor?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  limit?: number;
}
