import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsString,
  MaxLength,
} from 'class-validator';
import { LIMITS } from '../../../common/dto-limits.js';

export class UpdateRolePermissionsDto {
  /** Replaces the role's entire permission set (brief §4 "permisos configurables"). */
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(LIMITS.LABEL, { each: true })
  @ArrayMaxSize(LIMITS.LIST)
  permissionKeys!: string[];
}
