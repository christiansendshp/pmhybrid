import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentActorId } from '../../common/decorators/current-actor-id.decorator.js';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { SynchronizationService } from './synchronization.service.js';

/** "Sincronizar ahora" (brief §11) and a read-only sync-run history for the project. */
@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@Controller('projects/:projectId')
export class SynchronizationController {
  constructor(
    private readonly synchronizationService: SynchronizationService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('sync')
  triggerManualSync(
    @Param('projectId') projectId: string,
    @CurrentActorId() requesterActorId: string,
  ) {
    return this.synchronizationService.runSync(
      projectId,
      'MANUAL',
      requesterActorId,
    );
  }

  @Get('sync-runs')
  listSyncRuns(@Param('projectId') projectId: string) {
    return this.prisma.syncRun.findMany({
      where: { projectId },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
  }
}
