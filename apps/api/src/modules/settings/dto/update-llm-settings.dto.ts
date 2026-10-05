import {
  LLM_LIMITS,
  LLM_PROVIDERS,
  type LlmProviderKey,
} from '@pmhybrid/shared-types';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

/** Printable ASCII, no space: what a provider key is made of, and nothing that could split a header. */
const API_KEY_CHARACTERS = /^[\x21-\x7E]+$/;
/** A provider's model identifier (`claude-haiku-4-5-20251001`, `gpt-4o-mini`, `ft:gpt-4o:org:name:id`). */
const MODEL_CHARACTERS = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

/**
 * Every field is optional: a call changes only what it names. `apiKey` is
 * write-only — nothing the API sends back carries it — and absent means
 * "keep the stored one". `temperature: null` clears it.
 */
export class UpdateLlmSettingsDto {
  @IsOptional()
  @IsIn(LLM_PROVIDERS)
  provider?: LlmProviderKey;

  @IsOptional()
  @IsString()
  @MaxLength(LLM_LIMITS.MODEL_MAX_LENGTH)
  @Matches(MODEL_CHARACTERS, { message: 'model is not a valid model name' })
  model?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(LLM_LIMITS.API_KEY.min)
  @MaxLength(LLM_LIMITS.API_KEY.max)
  @Matches(API_KEY_CHARACTERS, {
    message: 'apiKey must be printable characters without spaces',
  })
  apiKey?: string;

  @ValidateIf(
    (_: UpdateLlmSettingsDto, value: unknown) =>
      value !== undefined && value !== null,
  )
  @IsNumber()
  @Min(LLM_LIMITS.TEMPERATURE.min)
  @Max(LLM_LIMITS.TEMPERATURE.max)
  temperature?: number | null;

  @IsOptional()
  @IsInt()
  @Min(LLM_LIMITS.TIMEOUT_MS.min)
  @Max(LLM_LIMITS.TIMEOUT_MS.max)
  timeoutMs?: number;

  @IsOptional()
  @IsInt()
  @Min(LLM_LIMITS.MAX_TOKENS.min)
  @Max(LLM_LIMITS.MAX_TOKENS.max)
  maxTokens?: number;
}
