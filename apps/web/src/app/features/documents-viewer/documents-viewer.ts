import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { LabelPipe } from '../../shared/label.pipe.js';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  DocumentHeading,
  extractHeadings,
  findMatchingLines,
  highlightSegments,
} from '../../core/document-view.js';
import {
  DOCUMENT_KINDS,
  DocumentKind,
  DocumentRevisionSummary,
  DocumentsService,
  ParsedAgentslog,
  ParsedRoadmapRow,
} from '../../core/documents.service.js';
import { describeHttpError } from '../../core/http-error.js';

type ViewMode = 'documental' | 'structured';

/** Documents (brief §10): documental + structured read views, search with
 * highlight and section navigation over the raw content, and revision
 * history. No orchestration or write-back here — synchronization.module. */
@Component({
  selector: 'app-documents-viewer',
  imports: [
    LabelPipe,
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './documents-viewer.html',
  styleUrl: './documents-viewer.scss',
})
export class DocumentsViewer implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly documentsService = inject(DocumentsService);

  readonly documentKinds = DOCUMENT_KINDS;
  readonly selectedKind = signal<DocumentKind>('roadmap');
  readonly viewMode = signal<ViewMode>('documental');
  readonly searchQuery = signal('');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly rawContent = signal<string | null>(null);
  readonly roadmapRows = signal<ParsedRoadmapRow[] | null>(null);
  readonly agentslog = signal<ParsedAgentslog | null>(null);

  readonly revisions = signal<DocumentRevisionSummary[]>([]);
  readonly revisionsLoading = signal(false);
  /** null = viewing the live document; set = viewing one past revision's content instead. */
  readonly viewingRevisionId = signal<string | null>(null);
  readonly revisionContent = signal<string | null>(null);
  readonly revisionError = signal<string | null>(null);

  /** Whichever content is on screen right now — the live document, or a past revision. */
  readonly displayedContent = computed(() =>
    this.viewingRevisionId() ? this.revisionContent() : this.rawContent(),
  );
  readonly contentLines = computed(() => (this.displayedContent() ?? '').split('\n'));
  readonly headings = computed<DocumentHeading[]>(() =>
    extractHeadings(this.displayedContent() ?? ''),
  );
  readonly headingIdByLine = computed(
    () => new Map(this.headings().map((heading) => [heading.lineIndex, heading.id])),
  );
  readonly matchingLineCount = computed(
    () => findMatchingLines(this.displayedContent() ?? '', this.searchQuery()).length,
  );

  readonly filteredRoadmapRows = computed(() => {
    const rows = this.roadmapRows();
    const query = this.searchQuery().trim().toLowerCase();
    if (!rows || !query) {
      return rows;
    }
    return rows.filter((row) =>
      [row.externalId, row.outcome, row.blocker, row.statusRaw, row.ownerName].some((value) =>
        value?.toLowerCase().includes(query),
      ),
    );
  });

  readonly filteredAgentslogEntries = computed(() => {
    const log = this.agentslog();
    const query = this.searchQuery().trim().toLowerCase();
    if (!log || !query) {
      return log?.entries ?? null;
    }
    return log.entries.filter((entry) =>
      [entry.taskExternalId, entry.statusWord, entry.summary, entry.agentName].some((value) =>
        value?.toLowerCase().includes(query),
      ),
    );
  });

  readonly segmentsFor = (line: string) => highlightSegments(line, this.searchQuery());

  private get projectId(): string {
    return this.route.parent!.snapshot.paramMap.get('projectId')!;
  }

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async onKindChange(kind: DocumentKind): Promise<void> {
    this.selectedKind.set(kind);
    this.searchQuery.set('');
    await this.reload();
  }

  async onViewModeChange(mode: ViewMode): Promise<void> {
    this.viewMode.set(mode);
    await this.reload();
  }

  async viewRevision(revisionId: string): Promise<void> {
    this.revisionError.set(null);
    this.viewingRevisionId.set(revisionId);
    try {
      const revision = await this.documentsService.getRevision(
        this.projectId,
        this.selectedKind(),
        revisionId,
      );
      this.revisionContent.set(revision.rawContent);
    } catch (error) {
      this.revisionError.set(describeHttpError(error, 'No se pudo cargar esa revisión.'));
      this.viewingRevisionId.set(null);
    }
  }

  viewCurrent(): void {
    this.viewingRevisionId.set(null);
    this.revisionContent.set(null);
    this.revisionError.set(null);
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.rawContent.set(null);
    this.roadmapRows.set(null);
    this.agentslog.set(null);
    this.revisions.set([]);
    this.viewCurrent();
    try {
      const kind = this.selectedKind();
      if (this.viewMode() === 'documental') {
        this.revisionsLoading.set(true);
        const [doc, revisions] = await Promise.all([
          this.documentsService.getRaw(this.projectId, kind),
          this.documentsService.listRevisions(this.projectId, kind),
        ]);
        this.rawContent.set(doc.content);
        this.revisions.set(revisions);
      } else if (kind === 'roadmap') {
        this.roadmapRows.set(await this.documentsService.getStructuredRoadmap(this.projectId));
      } else if (kind === 'agentslog') {
        this.agentslog.set(await this.documentsService.getStructuredAgentslog(this.projectId));
      }
    } catch (error) {
      this.error.set(describeHttpError(error, 'No se pudo cargar este documento.'));
    } finally {
      this.loading.set(false);
      this.revisionsLoading.set(false);
    }
  }
}
