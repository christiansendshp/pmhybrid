import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const API_KEY_SCOPES = ['READ_ONLY', 'READ_WRITE'] as const;
export type ApiKeyScopeValue = (typeof API_KEY_SCOPES)[number];

/** Ten years: a key meant to outlive that has no expiry at all. */
export const MAX_API_KEY_LIFETIME_DAYS = 3650;

export class CreateApiKeyDto {
  /** Admin-facing label only (e.g. "CI pipeline", "staging bot") — never part of the secret. */
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  /** The key stops working this many days from now; omitted means it never expires (Roadmap SECURITY-04b2). */
  @IsInt()
  @Min(1)
  @Max(MAX_API_KEY_LIFETIME_DAYS)
  @IsOptional()
  expiresInDays?: number;

  /** READ_ONLY keys are refused every request that is not a read; omitted means READ_WRITE (Roadmap SECURITY-04b2). */
  @IsIn(API_KEY_SCOPES)
  @IsOptional()
  scope?: ApiKeyScopeValue;
}
