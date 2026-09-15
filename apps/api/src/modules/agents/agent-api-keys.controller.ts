import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PERMISSIONS } from '@pmhybrid/shared-types';
import { CurrentActorId } from '../../common/decorators/current-actor-id.decorator.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { PermissionGuard } from '../../common/guards/permission.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AgentApiKeysService } from './agent-api-keys.service.js';
import { CreateApiKeyDto } from './dto/create-api-key.dto.js';

/**
 * Controlled API access for AI agents (brief §27, §28, Roadmap GAP-15).
 * Every route needs the global actors.manage permission, same as creating
 * or editing the agent itself — minting a key is a form of granting that
 * agent access, not something a lesser-privileged actor should self-serve.
 * @RequirePermission is applied per-handler, not on the class: PermissionGuard
 * reads metadata off `context.getHandler()`, which never sees a class-level
 * decorator (see AgentsController for the same pattern).
 */
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('agents/:agentId/keys')
export class AgentApiKeysController {
  constructor(private readonly apiKeysService: AgentApiKeysService) {}

  @Get()
  @RequirePermission(PERMISSIONS.ACTORS_MANAGE)
  findAll(@Param('agentId') agentId: string) {
    return this.apiKeysService.findAllForAgent(agentId);
  }

  @Post()
  @RequirePermission(PERMISSIONS.ACTORS_MANAGE)
  create(
    @Param('agentId') agentId: string,
    @Body() dto: CreateApiKeyDto,
    @CurrentActorId() requesterActorId: string,
  ) {
    return this.apiKeysService.create(agentId, dto, requesterActorId);
  }

  @Delete(':keyId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.ACTORS_MANAGE)
  revoke(
    @Param('agentId') agentId: string,
    @Param('keyId') keyId: string,
    @CurrentActorId() requesterActorId: string,
  ) {
    return this.apiKeysService.revoke(agentId, keyId, requesterActorId);
  }
}
