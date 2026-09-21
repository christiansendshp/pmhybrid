import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { readRulesDocument } from '../git-providers/read-rules-document.js';
import { PROJECT_REPOSITORY_PROVIDER } from '../git-providers/project-repository-provider.interface.js';
import type { ProjectRepositoryProvider } from '../git-providers/project-repository-provider.interface.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AgentslogParserService } from './agentslog-parser.service.js';
import {
  resolveDocumentFilename,
  resolveDocumentKind,
} from './document-kind.util.js';
import { sanitizeSyncMessage } from '../synchronization/sync-failure.util.js';
import {
  ParsedRoadmap,
  RoadmapParserService,
} from './roadmap-parser.service.js';
import { RoadmapFormatError } from './roadmap-yaml-entry.util.js';

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
    // Tolerant: the rows that can be read; the ones that cannot are
    // reported by `roadmap/issues` (Roadmap BUG-05).
    return this.parseRoadmap(content).rows;
  }

  /** Roadmap entries that could not be read — id, line and a one-line reason each — so the UI can say what to fix. */
  @Get('roadmap/issues')
  async roadmapIssues(@Param('projectId') projectId: string) {
    const content = await this.readDocument(projectId, 'roadmap');
    return this.parseRoadmap(content).errors.map(({ id, line, reason }) => ({
      id,
      line,
      reason,
    }));
  }

  @Get('agentslog/structured')
  async agentslogStructured(@Param('projectId') projectId: string) {
    const content = await this.readDocument(projectId, 'agentslog');
    return this.agentslogParser.parse(content);
  }

  /**
   * Revision history (brief §10) — every content-changed snapshot
   * synchronization.service.ts recorded for this document, newest first.
   * A project that has never synced simply has none yet: an empty list,
   * not a 404 (the live file itself may still exist and read fine above).
   */
  @Get(':kind/revisions')
  async revisions(
    @Param('projectId') projectId: string,
    @Param('kind') kind: string,
  ) {
    const document = await this.prisma.document.findUnique({
      where: { projectId_kind: { projectId, kind: resolveDocumentKind(kind) } },
    });
    if (!document) {
      return [];
    }
    return this.prisma.documentRevision.findMany({
      where: { documentId: document.id },
      orderBy: { capturedAt: 'desc' },
      select: { id: true, contentHash: true, source: true, capturedAt: true },
    });
  }

  /** One past revision's full content, for viewing an earlier version of the document. */
  @Get(':kind/revisions/:revisionId')
  async revision(
    @Param('projectId') projectId: string,
    @Param('kind') kind: string,
    @Param('revisionId') revisionId: string,
  ) {
    const revision = await this.prisma.documentRevision.findFirst({
      where: {
        id: revisionId,
        document: { projectId, kind: resolveDocumentKind(kind) },
      },
    });
    if (!revision) {
      throw new NotFoundException('Revision not found');
    }
    return revision;
  }

  /** A document malformed as a whole (an unterminated fence) is a 422 with a readable reason, not a 500; one unreadable entry never reaches here — it lands in `errors`. */
  private parseRoadmap(content: string): ParsedRoadmap {
    try {
      return this.roadmapParser.parseTolerant(content);
    } catch (error) {
      if (error instanceof RoadmapFormatError) {
        throw new UnprocessableEntityException(
          sanitizeSyncMessage(error.message),
        );
      }
      throw error;
    }
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
      if (kind === 'agents-rules') {
        // docs/Agents.md, or the repository-root AGENTS.md the latest skill
        // uses (Roadmap GAP-37c).
        return (
          await readRulesDocument(this.repositoryProvider, project.docsPath)
        ).content;
      }
      return await this.repositoryProvider.readFile(project.docsPath, filename);
    } catch {
      throw new NotFoundException(
        `${filename} not found under this project's docsPath`,
      );
    }
  }
}
