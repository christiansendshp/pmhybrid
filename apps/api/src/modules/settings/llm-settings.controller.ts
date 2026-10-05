import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Put,
  UseGuards,
} from '@nestjs/common';
import { PERMISSIONS } from '@pmhybrid/shared-types';
import type { AuditOrigin } from '@prisma/client';
import { CurrentActorId } from '../../common/decorators/current-actor-id.decorator.js';
import { CurrentAuditOrigin } from '../../common/decorators/current-audit-origin.decorator.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { PermissionGuard } from '../../common/guards/permission.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
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
  constructor(private readonly settings: LlmSettingsService) {}

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

  @Delete('api-key')
  @HttpCode(200)
  removeApiKey(
    @CurrentActorId() actorId: string,
    @CurrentAuditOrigin() origin: AuditOrigin,
  ) {
    return this.settings.removeApiKey(actorId, origin);
  }
}
