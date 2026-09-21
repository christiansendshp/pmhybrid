import {
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { LIMITS } from '../../../common/dto-limits.js';

export class CreateAgentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.NAME)
  displayName!: string;

  /** Free-form provider identifier (brief §3 "no asumir nombres concretos") — e.g. claude, codex, gemini, custom. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.LABEL)
  providerType!: string;

  @IsEmail()
  @IsOptional()
  @MaxLength(LIMITS.EMAIL)
  email?: string;

  @IsUrl({ require_tld: false })
  @IsOptional()
  @MaxLength(LIMITS.URL)
  avatarUrl?: string;

  /** Non-secret settings only; credential-looking keys are rejected (see agent-config.util.ts). */
  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;
}
