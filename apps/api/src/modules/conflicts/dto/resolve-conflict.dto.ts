import { IsEnum, IsObject, IsOptional } from 'class-validator';
import { ConflictResolutionKind } from '@prisma/client';

export class ResolveConflictDto {
  @IsEnum(ConflictResolutionKind)
  strategy!: ConflictResolutionKind;

  /** Required for MANUAL_EDIT — the fields to apply onto the Task. */
  @IsObject()
  @IsOptional()
  manualValue?: Record<string, unknown>;
}
