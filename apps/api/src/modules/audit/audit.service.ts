import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Subscribes to domain events rather than being called inline from every
 * service (docs/architecture.md's "cross-cutting concerns via events").
 * Real event payloads/AuditEvent writes for task.status.changed etc. land
 * alongside the services that first emit them (FASE-07 onward).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('task.status.changed')
  handleTaskStatusChanged(payload: unknown): void {
    void this.prisma;
    this.logger.debug(`task.status.changed: ${JSON.stringify(payload)}`);
  }
}
