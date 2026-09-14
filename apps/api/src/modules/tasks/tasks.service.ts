import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * FASE-03 shell: module boundary + Prisma wiring only. Full CRUD, subtask
 * handling, TaskDependency cycle checks, and the transition-policy
 * enforcement (task-status-policy.ts) land in FASE-07.
 */
@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  findAllForProject(projectId: string) {
    return this.prisma.task.findMany({ where: { projectId } });
  }
}
