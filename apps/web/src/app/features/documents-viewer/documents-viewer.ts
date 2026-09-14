import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSelectModule } from '@angular/material/select';
import {
  DOCUMENT_KINDS,
  DocumentKind,
  DocumentsService,
  ParsedAgentslog,
  ParsedRoadmapRow,
} from '../../core/documents.service.js';

type ViewMode = 'documental' | 'structured';

@Component({
  selector: 'app-documents-viewer',
  imports: [FormsModule, MatSelectModule, MatButtonToggleModule],
  templateUrl: './documents-viewer.html',
})
export class DocumentsViewer implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly documentsService = inject(DocumentsService);

  readonly documentKinds = DOCUMENT_KINDS;
  readonly selectedKind = signal<DocumentKind>('roadmap');
  readonly viewMode = signal<ViewMode>('documental');

  readonly loading = signal(false);
  readonly rawContent = signal<string | null>(null);
  readonly roadmapRows = signal<ParsedRoadmapRow[] | null>(null);
  readonly agentslog = signal<ParsedAgentslog | null>(null);

  private get projectId(): string {
    return this.route.parent!.snapshot.paramMap.get('projectId')!;
  }

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async onKindChange(kind: DocumentKind): Promise<void> {
    this.selectedKind.set(kind);
    await this.reload();
  }

  async onViewModeChange(mode: ViewMode): Promise<void> {
    this.viewMode.set(mode);
    await this.reload();
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    this.rawContent.set(null);
    this.roadmapRows.set(null);
    this.agentslog.set(null);
    try {
      const kind = this.selectedKind();
      if (this.viewMode() === 'documental') {
        const doc = await this.documentsService.getRaw(this.projectId, kind);
        this.rawContent.set(doc.content);
      } else if (kind === 'roadmap') {
        this.roadmapRows.set(await this.documentsService.getStructuredRoadmap(this.projectId));
      } else if (kind === 'agentslog') {
        this.agentslog.set(await this.documentsService.getStructuredAgentslog(this.projectId));
      }
    } finally {
      this.loading.set(false);
    }
  }
}
