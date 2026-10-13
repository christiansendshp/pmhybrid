import { AGENT_STAGE_ROLES, type AgentStageRole } from '@pmhybrid/shared-types';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';
import { LIMITS } from '../../../common/dto-limits.js';
import { MAX_ALIASES } from '../agent-identity.util.js';

/** No `|` (it separates the fields of a ledger header), no line break, no control character. */
// eslint-disable-next-line no-control-regex
const IDENTIFIER_SHAPE = /^[^|\u0000-\u001f\u007f]*$/;

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

  /**
   * The one exact string the agent passes to the skill (Roadmap TASK-01): the
   * skill compares it exactly, so it is also what PM Hub writes in the ledger.
   * Omitted, it is the display name; `null` on an update goes back to that.
   */
  @IsString()
  @MaxLength(LIMITS.ID)
  @Matches(IDENTIFIER_SHAPE, {
    message: 'ledgerName must not hold "|" or a control character',
  })
  @IsOptional()
  ledgerName?: string | null;

  /** Other strings the agent has written in the documents. Replaces the list when sent. */
  @IsArray()
  @ArrayMaxSize(MAX_ALIASES)
  @IsString({ each: true })
  @MaxLength(LIMITS.ID, { each: true })
  @Matches(IDENTIFIER_SHAPE, {
    each: true,
    message: 'an alias must not hold "|" or a control character',
  })
  @IsOptional()
  aliases?: string[];

  /** The model the agent runs as. `null` on an update clears it. */
  @IsString()
  @MaxLength(LIMITS.LABEL)
  @IsOptional()
  model?: string | null;

  /** Whether the agent develops, reviews or both; defaults to both. */
  @IsIn(AGENT_STAGE_ROLES)
  @IsOptional()
  stageRole?: AgentStageRole;
}
