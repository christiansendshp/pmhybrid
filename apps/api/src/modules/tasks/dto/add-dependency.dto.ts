import { IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { LIMITS } from '../../../common/dto-limits.js';

/** Exactly one of the two — an internal Task or an opaque external reference (e.g. a not-yet-synced Roadmap ID). */
export class AddDependencyDto {
  @ValidateIf((o: AddDependencyDto) => !o.rawExternalRef)
  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.ID)
  dependsOnTaskId?: string;

  @ValidateIf((o: AddDependencyDto) => !o.dependsOnTaskId)
  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.LABEL)
  rawExternalRef?: string;
}
