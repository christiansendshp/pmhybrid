import {
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

export class CreateAgentDto {
  @IsString()
  @IsNotEmpty()
  displayName!: string;

  /** Free-form provider identifier (brief §3 "no asumir nombres concretos") — e.g. claude, codex, gemini, custom. */
  @IsString()
  @IsNotEmpty()
  providerType!: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsUrl({ require_tld: false })
  @IsOptional()
  avatarUrl?: string;

  /** Non-secret settings only; credential-looking keys are rejected (see agent-config.util.ts). */
  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;
}
