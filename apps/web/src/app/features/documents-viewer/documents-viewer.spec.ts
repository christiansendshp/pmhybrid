import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DocumentRevisionSummary,
  DocumentsService,
  ParsedRoadmapRow,
} from '../../core/documents.service.js';
import { DocumentsViewer } from './documents-viewer.js';

describe('DocumentsViewer (brief §10)', () => {
  let getRaw: ReturnType<typeof vi.fn>;
  let getRevision: ReturnType<typeof vi.fn>;
  let listRevisions: ReturnType<typeof vi.fn>;
  let getStructuredRoadmap: ReturnType<typeof vi.fn>;
  let getStructuredAgentslog: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getRaw = vi.fn().mockResolvedValue({ kind: 'roadmap', content: '# Roadmap\n\nSome text' });
    getRevision = vi.fn();
    listRevisions = vi.fn().mockResolvedValue([]);
    getStructuredRoadmap = vi.fn().mockResolvedValue([]);
    getStructuredAgentslog = vi.fn().mockResolvedValue({ entries: [] });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'projects/:projectId',
            children: [{ path: 'documents', component: DocumentsViewer }],
          },
        ]),
        {
          provide: DocumentsService,
          useValue: {
            getRaw,
            getRevision,
            listRevisions,
            getStructuredRoadmap,
            getStructuredAgentslog,
          },
        },
      ],
    });
  });

  async function render() {
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/projects/p1/documents', DocumentsViewer);
    await new Promise((resolve) => setTimeout(resolve));
    harness.detectChanges();
    return {
      harness,
      component,
      text: () => (harness.routeNativeElement!.textContent ?? '').replace(/\s+/g, ' '),
    };
  }

  it('shows the raw document content by default, with an empty revision history', async () => {
    const { text } = await render();

    expect(getRaw).toHaveBeenCalledWith('p1', 'roadmap');
    expect(text()).toContain('Roadmap');
    expect(text()).toContain('Some text');
    expect(text()).toContain(
      'Todavía no hay revisiones registradas para este documento — cambia cuando el proyecto se sincroniza.',
    );
  });

  it('lists past revisions and lets you view one, then return to the current content', async () => {
    const revisions: DocumentRevisionSummary[] = [
      { id: 'r1', contentHash: 'h1', source: 'SYNC', capturedAt: '2026-09-15T10:00:00.000Z' },
    ];
    listRevisions.mockResolvedValue(revisions);
    getRevision.mockResolvedValue({
      id: 'r1',
      contentHash: 'h1',
      source: 'SYNC',
      capturedAt: '2026-09-15T10:00:00.000Z',
      rawContent: 'old content',
    });
    const { harness, component, text } = await render();

    expect(text()).toContain('SYNC');

    await component.viewRevision('r1');
    harness.detectChanges();
    expect(component.viewingRevisionId()).toBe('r1');
    expect(text()).toContain('Viendo una revisión anterior.');
    expect(text()).toContain('old content');

    component.viewCurrent();
    harness.detectChanges();
    expect(component.viewingRevisionId()).toBeNull();
  });

  it('renders the structured roadmap table, with a Spanish empty state', async () => {
    const { harness, component, text } = await render();

    await component.onViewModeChange('structured');
    harness.detectChanges();
    expect(text()).toContain('Todavía no hay filas en esta tabla.');

    const row: ParsedRoadmapRow = {
      externalId: 'PMH-1',
      table: 'ACTIVE',
      outcome: 'Build API',
      statusRaw: 'EN_DESARROLLO',
    };
    getStructuredRoadmap.mockResolvedValue([row]);
    await component.onKindChange('roadmap');
    harness.detectChanges();
    expect(text()).toContain('PMH-1');
    expect(text()).toContain('Build API');
  });

  it('renders the structured Agentslog list, with a Spanish empty state', async () => {
    const { harness, component, text } = await render();
    await component.onViewModeChange('structured');
    await component.onKindChange('agentslog');
    harness.detectChanges();

    expect(text()).toContain('Todavía no hay entradas de Agentslog.');

    getStructuredAgentslog.mockResolvedValue({
      entries: [
        {
          timestampFromLog: '2026-09-15T10:00:00.000Z',
          agentName: 'Codex',
          taskExternalId: 'PMH-1',
          statusWord: 'DONE',
          summary: 'Shipped it',
          files: '',
          verify: '',
          followUp: '',
          rawEntryHash: 'h1',
        },
      ],
    });
    await component.onKindChange('agentslog');
    harness.detectChanges();
    expect(text()).toContain('Codex');
    expect(text()).toContain('Shipped it');
  });

  it('reports a failed load instead of rendering an empty document silently', async () => {
    getRaw.mockRejectedValue(new Error('boom'));
    const { text } = await render();

    expect(text()).toContain('No se pudo cargar este documento.');
  });
});
