import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentActorId } from '../../common/decorators/current-actor-id.decorator.js';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ConflictsService } from './conflicts.service.js';
import { ResolveConflictDto } from './dto/resolve-conflict.dto.js';

@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@Controller('projects/:projectId/conflicts')
export class ConflictsController {
  constructor(private readonly conflictsService: ConflictsService) {}

  @Get()
  findAll(
    @Param('projectId') projectId: string,
    @Query('resolved') resolved?: string,
  ) {
    return this.conflictsService.findAllForProject(
      projectId,
      resolved === undefined ? undefined : resolved === 'true',
    );
  }

  @Get(':id')
  findOne(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.conflictsService.findById(projectId, id);
  }

  @Post(':id/resolve')
  resolve(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: ResolveConflictDto,
    @CurrentActorId() requesterActorId: string,
  ) {
    return this.conflictsService.resolve(projectId, id, dto, requesterActorId);
  }
}
