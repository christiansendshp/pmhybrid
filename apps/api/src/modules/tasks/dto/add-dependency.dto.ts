import { IsNotEmpty, IsString, ValidateIf } from 'class-validator';

/** Exactly one of the two — an internal Task or an opaque external reference (e.g. a not-yet-synced Roadmap ID). */
export class AddDependencyDto {
  @ValidateIf((o: AddDependencyDto) => !o.rawExternalRef)
  @IsString()
  @IsNotEmpty()
  dependsOnTaskId?: string;

  @ValidateIf((o: AddDependencyDto) => !o.dependsOnTaskId)
  @IsString()
  @IsNotEmpty()
  rawExternalRef?: string;
}
