import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  PERMISSIONS,
  type LlmConnectionTestResult,
} from '@pmhybrid/shared-types';
import type { AuditOrigin } from '@prisma/client';
import { CurrentActorId } from '../../common/decorators/current-actor-id.decorator.js';
import { CurrentAuditOrigin } from '../../common/decorators/current-audit-origin.decorator.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { PermissionGuard } from '../../common/guards/permission.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { LlmClient } from '../llm/llm-client.service.js';
import { UpdateLlmSettingsDto } from './dto/update-llm-settings.dto.js';
import { LlmSettingsService } from './llm-settings.service.js';

/**
 * The instance's LLM configuration (Roadmap GAP-39a). Every route needs the
 * global `settings.manage` permission — reading included, since even the
 * model and the state of the integration are administration's business — and
 * no response carries the API key, only `hasApiKey`.
 */
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission(PERMISSIONS.SETTINGS_MANAGE)
@Controller('settings/llm')
export class LlmSettingsController {
  constructor(
    private readonly settings: LlmSettingsService,
    private readonly llm: LlmClient,
  ) {}

  @Get()
  get() {
    return this.settings.getView();
  }

  @Put()
  update(
    @Body() dto: UpdateLlmSettingsDto,
    @CurrentActorId() actorId: string,
    @CurrentAuditOrigin() origin: AuditOrigin,
  ) {
    return this.settings.update(dto, actorId, origin);
  }

  /**
   * A real, minimal call with the stored configuration, so a key, a model and the
   * network are known to work before the integration is relied on. It answers
   * 200 either way — the body says — and an error in it is already free of the key.
   */
  @Post('test')
  @HttpCode(200)
  async test(): Promise<LlmConnectionTestResult> {
    const config = await this.settings.getRuntimeConfig({
      requireEnabled: false,
    });
    if (!config) {
      return { ok: false, error: 'No readable API key is stored' };
    }
    return this.llm.testConnection(config);
  }

  @Delete('api-key')
  @HttpCode(200)
  removeApiKey(
    @CurrentActorId() actorId: string,
    @CurrentAuditOrigin() origin: AuditOrigin,
  ) {
    return this.settings.removeApiKey(actorId, origin);
  }
}
