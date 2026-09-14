import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/** FASE-03 shell. Real CRUD + settings (sync interval, docsPath, rollup strategy) land in FASE-05. */
@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.project.findMany();
  }
}
