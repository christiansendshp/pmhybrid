import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateApiKeyDto {
  /** Admin-facing label only (e.g. "CI pipeline", "staging bot") — never part of the secret. */
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;
}
