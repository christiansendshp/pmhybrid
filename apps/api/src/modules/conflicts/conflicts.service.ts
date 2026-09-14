import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Conflict is a first-class entity (brief §26) with its own endpoints, not
 * just an audit log line. Resolution logic (KEEP_LOCAL/KEEP_EXTERNAL/
 * MANUAL_EDIT/DISMISSED) lands in FASE-08 alongside Synchronization.
 */
@Injectable()
export class ConflictsService {
  constructor(private readonly prisma: PrismaService) {}

  findAllForProject(projectId: string) {
    return this.prisma.conflict.findMany({ where: { projectId } });
  }
}
