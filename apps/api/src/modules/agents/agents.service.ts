import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/** FASE-03 shell — thin layer over Actor(kind=AI_AGENT)/AgentProfile. Real CRUD lands later. */
@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.actor.findMany({ where: { kind: 'AI_AGENT' } });
  }
}
