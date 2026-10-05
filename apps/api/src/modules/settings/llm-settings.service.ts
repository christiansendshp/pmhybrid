import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LLM_DEFAULT_MODELS,
  LLM_LIMITS,
  LLM_PROVIDERS,
  type LlmProviderKey,
  type LlmSettingsStatus,
  type LlmSettingsView,
} from '@pmhybrid/shared-types';
import type { AuditOrigin, LlmSettings } from '@prisma/client';
import {
  decryptSecret,
  encryptSecret,
} from '../../common/secret-crypto.util.js';
import type { EnvConfig } from '../../config/env.validation.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService, diffFields } from '../audit/audit.service.js';
import type { LlmRuntimeConfig } from '../llm/llm.types.js';
import type { UpdateLlmSettingsDto } from './dto/update-llm-settings.dto.js';

/** The row's id: the configuration is one per instance. */
export const LLM_SETTINGS_ID = 'instance';
const SECRET_PURPOSE = 'llm-api-key';
const ENTITY_TYPE = 'LlmSettings';

const isProvider = (value: string): value is LlmProviderKey =>
  (LLM_PROVIDERS as readonly string[]).includes(value);

/**
 * The instance's LLM configuration (Roadmap GAP-39a), kept in the database and
 * nowhere else: not in `.env`, not in a variable. The API key is encrypted at
 * rest and only ever leaves this service in `getRuntimeConfig`, for the
 * server's own calls — every response, audit event and log line is built
 * without it, so there is no path from here to the browser that carries it.
 */
@Injectable()
export class LlmSettingsService {
  private readonly logger = new Logger(LlmSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async getView(): Promise<LlmSettingsView> {
    return this.toView(await this.load());
  }

  async update(
    dto: UpdateLlmSettingsDto,
    actorId: string,
    origin: AuditOrigin = 'UI',
  ): Promise<LlmSettingsView> {
    const existing = await this.load();
    const before = this.toView(existing);

    const provider = dto.provider ?? before.provider;
    // A model of one provider means nothing to another: changing the provider
    // without naming a model moves to that provider's default.
    const model =
      dto.model ??
      (dto.provider && dto.provider !== before.provider
        ? LLM_DEFAULT_MODELS[provider]
        : before.model);
    const apiKeyEncrypted =
      dto.apiKey !== undefined
        ? this.encrypt(dto.apiKey)
        : (existing?.apiKeyEncrypted ?? null);

    const hasUsableKey =
      apiKeyEncrypted !== null && this.decrypt(apiKeyEncrypted) !== null;
    const enabled = dto.enabled ?? before.enabled;
    if (enabled && !hasUsableKey) {
      throw new BadRequestException('An API key is required to enable the LLM');
    }

    const data = {
      provider,
      model,
      enabled,
      apiKeyEncrypted,
      temperature:
        dto.temperature === undefined ? before.temperature : dto.temperature,
      timeoutMs: dto.timeoutMs ?? before.timeoutMs,
      maxTokens: dto.maxTokens ?? before.maxTokens,
    };
    const saved = await this.prisma.llmSettings.upsert({
      where: { id: LLM_SETTINGS_ID },
      create: { id: LLM_SETTINGS_ID, ...data },
      update: data,
    });

    // The key itself is never audited, only that it changed.
    const diff = diffFields(
      {
        provider: before.provider,
        model: before.model,
        enabled: before.enabled,
        temperature: before.temperature,
        timeoutMs: before.timeoutMs,
        maxTokens: before.maxTokens,
      },
      {
        provider,
        model,
        enabled,
        temperature: data.temperature,
        timeoutMs: data.timeoutMs,
        maxTokens: data.maxTokens,
      },
    );
    if (diff || dto.apiKey !== undefined) {
      await this.audit.record({
        // An event about the instance, not about a project.
        projectId: null,
        actorId,
        entityType: ENTITY_TYPE,
        entityId: LLM_SETTINGS_ID,
        operation: 'UPDATE',
        origin,
        previousValue: diff?.previousValue,
        newValue: {
          ...diff?.newValue,
          ...(dto.apiKey !== undefined ? { apiKeyChanged: true } : {}),
        },
      });
    }
    return this.toView(saved);
  }

  /** Forgets the stored key, which also switches the integration off: without a key there is nothing to call. */
  async removeApiKey(
    actorId: string,
    origin: AuditOrigin = 'UI',
  ): Promise<LlmSettingsView> {
    const existing = await this.load();
    if (!existing?.apiKeyEncrypted) {
      return this.toView(existing);
    }
    const saved = await this.prisma.llmSettings.update({
      where: { id: LLM_SETTINGS_ID },
      data: { apiKeyEncrypted: null, enabled: false },
    });
    await this.audit.record({
      projectId: null,
      actorId,
      entityType: ENTITY_TYPE,
      entityId: LLM_SETTINGS_ID,
      operation: 'UPDATE',
      origin,
      previousValue: { enabled: existing.enabled },
      newValue: { enabled: false, apiKeyRemoved: true },
    });
    return this.toView(saved);
  }

  /**
   * The configuration for a call to the provider, or null unless it is READY.
   * `requireEnabled: false` is for the connection test alone: an administrator
   * checks a key before switching the integration on. Server-side only: the key
   * is in clear here, and no controller returns it.
   */
  async getRuntimeConfig(
    options: { requireEnabled: boolean } = { requireEnabled: true },
  ): Promise<LlmRuntimeConfig | null> {
    const row = await this.load();
    if (
      !row?.apiKeyEncrypted ||
      (options.requireEnabled && !row.enabled) ||
      !isProvider(row.provider)
    ) {
      return null;
    }
    const apiKey = this.decrypt(row.apiKeyEncrypted);
    if (apiKey === null) {
      this.logger.warn(
        'The stored LLM API key cannot be decrypted (was JWT_SECRET changed?); enter it again in Settings',
      );
      return null;
    }
    return {
      provider: row.provider,
      model: row.model,
      apiKey,
      temperature: row.temperature,
      timeoutMs: row.timeoutMs,
      maxTokens: row.maxTokens,
    };
  }

  private load(): Promise<LlmSettings | null> {
    return this.prisma.llmSettings.findUnique({
      where: { id: LLM_SETTINGS_ID },
    });
  }

  /** The row as the API shows it: a fixed list of fields, so a column added later cannot leak by default. */
  private toView(row: LlmSettings | null): LlmSettingsView {
    const provider: LlmProviderKey =
      row && isProvider(row.provider) ? row.provider : 'ANTHROPIC';
    return {
      provider,
      model: row?.model ?? LLM_DEFAULT_MODELS[provider],
      enabled: row?.enabled ?? false,
      hasApiKey: Boolean(row?.apiKeyEncrypted),
      status: this.statusOf(row),
      temperature: row?.temperature ?? null,
      timeoutMs: row?.timeoutMs ?? LLM_LIMITS.TIMEOUT_MS.default,
      maxTokens: row?.maxTokens ?? LLM_LIMITS.MAX_TOKENS.default,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  private statusOf(row: LlmSettings | null): LlmSettingsStatus {
    if (!row?.apiKeyEncrypted) {
      return 'NOT_CONFIGURED';
    }
    if (this.decrypt(row.apiKeyEncrypted) === null) {
      return 'KEY_UNREADABLE';
    }
    return row.enabled ? 'READY' : 'DISABLED';
  }

  private encrypt(plaintext: string): string {
    return encryptSecret(
      plaintext,
      this.config.get('JWT_SECRET', { infer: true }),
      SECRET_PURPOSE,
    );
  }

  private decrypt(token: string): string | null {
    return decryptSecret(
      token,
      this.config.get('JWT_SECRET', { infer: true }),
      SECRET_PURPOSE,
    );
  }
}
