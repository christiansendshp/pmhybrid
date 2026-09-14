import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PROJECT_REPOSITORY_PROVIDER } from '../git-providers/project-repository-provider.interface.js';
import type { ProjectRepositoryProvider } from '../git-providers/project-repository-provider.interface.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AgentslogParserService } from './agentslog-parser.service.js';
import { resolveDocumentFilename } from './document-kind.util.js';
import { RoadmapParserService } from './roadmap-parser.service.js';

/**
 * Read-only documental + structured views (brief §10, FASE-06). No
 * persistence and no scheduling here — that's synchronization.module
 * (FASE-08). Every read goes straight to the managed project's own
 * filesystem via ProjectRepositoryProvider; nothing is cached.
 */
@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@Controller('projects/:projectId/documents')
export class RoadmapController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PROJECT_REPOSITORY_PROVIDER)
    private readonly repositoryProvider: ProjectRepositoryProvider,
    private readonly roadmapParser: RoadmapParserService,
    private readonly agentslogParser: AgentslogParserService,
  ) {}

  @Get(':kind/raw')
  async raw(
    @Param('projectId') projectId: string,
    @Param('kind') kind: string,
  ) {
    const content = await this.readDocument(projectId, kind);
    return { kind, content };
  }

  @Get('roadmap/structured')
  async roadmapStructured(@Param('projectId') projectId: string) {
    const content = await this.readDocument(projectId, 'roadmap');
    return this.roadmapParser.parse(content);
  }

  @Get('agentslog/structured')
  async agentslogStructured(@Param('projectId') projectId: string) {
    const content = await this.readDocument(projectId, 'agentslog');
    return this.agentslogParser.parse(content);
  }

  private async readDocument(projectId: string, kind: string): Promise<string> {
    const filename = resolveDocumentFilename(kind);
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    try {
      return await this.repositoryProvider.readFile(project.docsPath, filename);
    } catch {
      throw new NotFoundException(
        `${filename} not found under this project's docsPath`,
      );
    }
  }
}
