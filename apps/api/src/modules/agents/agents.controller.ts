import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PERMISSIONS } from '@pmhybrid/shared-types';
import { CurrentActorId } from '../../common/decorators/current-actor-id.decorator.js';
import { CurrentAuditOrigin } from '../../common/decorators/current-audit-origin.decorator.js';
import type { AuditOrigin } from '@prisma/client';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { PermissionGuard } from '../../common/guards/permission.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AgentsService } from './agents.service.js';
import { CreateAgentDto } from './dto/create-agent.dto.js';
import { UpdateAgentDto } from './dto/update-agent.dto.js';

/** Any authenticated actor can see the agents; creating or configuring one needs the global actors.manage permission. */
@UseGuards(JwtAuthGuard)
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  findAll() {
    return this.agentsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.agentsService.findById(id);
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.ACTORS_MANAGE)
  create(
    @Body() dto: CreateAgentDto,
    @CurrentActorId() requesterActorId: string,
    @CurrentAuditOrigin() origin: AuditOrigin,
  ) {
    return this.agentsService.create(dto, requesterActorId, origin);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.ACTORS_MANAGE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAgentDto,
    @CurrentActorId() requesterActorId: string,
    @CurrentAuditOrigin() origin: AuditOrigin,
  ) {
    return this.agentsService.update(id, dto, requesterActorId, origin);
  }
}
