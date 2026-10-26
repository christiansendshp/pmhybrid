import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DocumentRevisionSummary,
  DocumentsService,
  ParsedRoadmapRow,
} from '../../core/documents.service.js';
import { ProjectContext } from '../../core/project-context.js';
import { DocumentsViewer } from './documents-viewer.js';

describe('DocumentsViewer (brief §10)', () => {
  let getRaw: ReturnType<typeof vi.fn>;
  let getRevision: ReturnType<typeof vi.fn>;
  let listRevisions: ReturnType<typeof vi.fn>;
  let getStructuredRoadmap: ReturnType<typeof vi.fn>;
  let getStructuredAgentslog: ReturnType<typeof vi.fn>;
  let getLedgerWords: ReturnType<typeof vi.fn>;
  let getUntrackedWork: ReturnType<typeof vi.fn>;
  let importUntracked: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getRaw = vi.fn().mockResolvedValue({ kind: 'roadmap', content: '# Roadmap\n\nSome text' });
    getRevision = vi.fn();
    listRevisions = vi.fn().mockResolvedValue([]);
    getStructuredRoadmap = vi.fn().mockResolvedValue([]);
    getStructuredAgentslog = vi.fn().mockResolvedValue({ entries: [] });
    getLedgerWords = vi.fn().mockResolvedValue([]);
    getUntrackedWork = vi.fn().mockResolvedValue([]);
    importUntracked = vi.fn().mockResolvedValue({ imported: [], skipped: [] });
    TestBed.configureTestingModule({
      providers: [
        ProjectContext,
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
            getLedgerWords,
            getUntrackedWork,
            importUntracked,
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

    expect(text()).toContain('Sincronización');

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

  describe('the status words of the ledger (Roadmap TASK-30)', () => {
    const word = (overrides: Record<string, unknown>) => ({
      word: 'DONE',
      canonicalStatus: 'DONE',
      entries: 10,
      qualifier: null,
      ...overrides,
    });
    const openStructuredLedger = async () => {
      const view = await render();
      await view.component.onViewModeChange('structured');
      await view.component.onKindChange('agentslog');
      view.harness.detectChanges();
      return view;
    };

    it('says how many words the ledger uses and that all of them are known', async () => {
      getLedgerWords.mockResolvedValue([
        word({}),
        word({ word: 'PAUSE', canonicalStatus: 'PAUSE' }),
      ]);

      const { text } = await openStructuredLedger();

      expect(text()).toContain('Palabras de estado del registro: 2 en uso · todas conocidas');
    });

    it('says which words it does not know and how many entries carry them', async () => {
      getLedgerWords.mockResolvedValue([
        word({ word: 'EN CURSO', canonicalStatus: 'OTHER', entries: 4 }),
        word({ word: 'N/A', canonicalStatus: 'OTHER', entries: 1 }),
        word({}),
      ]);

      const { text } = await openStructuredLedger();

      expect(text()).toContain('3 en uso · 2 desconocidas (5 entradas)');
    });

    it('lists each word with what it is read as, the unknown ones in words', async () => {
      getLedgerWords.mockResolvedValue([
        word({ word: 'EN CURSO', canonicalStatus: 'OTHER', entries: 4 }),
        word({
          word: 'BLOQUEADO_PO',
          canonicalStatus: 'BLOCKED',
          entries: 2,
          qualifier: 'PO',
        }),
      ]);

      const { harness } = await openStructuredLedger();

      const rows = Array.from(
        harness.routeNativeElement!.querySelectorAll('.ledger-words tbody tr'),
      ).map((row) =>
        Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.trim()),
      );
      expect(rows).toEqual([
        ['EN CURSO', 'No la conozco', '4', ''],
        ['BLOQUEADO_PO', 'BLOCKED', '2', 'PO'],
      ]);
    });

    it('still shows the entries when the words could not be read', async () => {
      getLedgerWords.mockRejectedValue(new Error('boom'));

      const { text, component } = await openStructuredLedger();

      expect(component.ledgerWords()).toBeNull();
      expect(text()).not.toContain('Palabras de estado');
      expect(text()).toContain('Todavía no hay entradas de Agentslog.');
    });

    it('asks for the words only for the ledger in the structured view', async () => {
      const { component } = await render();
      await component.onKindChange('features');

      expect(getLedgerWords).not.toHaveBeenCalled();
    });
  });

  describe('the ledger work that is no task (Roadmap TASK-33)', () => {
    const work = (externalId: string, overrides: Record<string, unknown> = {}) => ({
      externalId,
      entries: 3,
      agents: ['claude', 'codex'],
      firstSeen: '2026-10-01T10:00:00.000Z',
      lastSeen: '2026-10-05T10:00:00.000Z',
      lastWord: 'DONE',
      closed: true,
      ...overrides,
    });
    const openStructuredLedger = async () => {
      const view = await render();
      await view.component.onViewModeChange('structured');
      await view.component.onKindChange('agentslog');
      view.harness.detectChanges();
      return view;
    };

    it('says how many IDs the ledger works on that are no task, and how many of them closed', async () => {
      getUntrackedWork.mockResolvedValue([
        work('X-1', { closed: false, lastWord: 'PAUSE' }),
        work('X-2'),
        work('X-3'),
      ]);

      const { text } = await openStructuredLedger();

      expect(text()).toContain(
        'Registro sin tarea: 3 IDs que no son tareas del proyecto (2 cerrados)',
      );
    });

    it('lists each ID with its entries, agents and last word, saying in words whether it closed', async () => {
      getUntrackedWork.mockResolvedValue([
        work('X-1', { closed: false, lastWord: 'PAUSE' }),
        work('X-2'),
      ]);

      const { harness } = await openStructuredLedger();

      const rows = Array.from(
        harness.routeNativeElement!.querySelectorAll('.untracked-work tbody tr'),
      ).map((row) =>
        Array.from(row.querySelectorAll('td'))
          .slice(0, 6)
          .map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim()),
      );
      expect(rows).toEqual([
        ['X-1', '3', 'claude, codex', '1 Oct 2026', '5 Oct 2026', 'PAUSE (sigue abierto)'],
        ['X-2', '3', 'claude, codex', '1 Oct 2026', '5 Oct 2026', 'DONE (cerrado)'],
      ]);
    });

    it('shows the entries of one ID when asked, by searching the list for it', async () => {
      getUntrackedWork.mockResolvedValue([work('X-1')]);
      const { harness, component } = await openStructuredLedger();

      harness
        .routeNativeElement!.querySelector<HTMLButtonElement>(
          'button[aria-label="Ver las entradas de X-1"]',
        )!
        .click();

      expect(component.searchQuery()).toBe('X-1');
    });

    describe('importing the closed ones (Roadmap TASK-34)', () => {
      const closed = (id: string) => work(id);
      const open = (id: string) => work(id, { closed: false, lastWord: 'PAUSE' });
      const asWriter = () => TestBed.inject(ProjectContext).permissions.set(['task.write']);
      const buttonsOf = (root: HTMLElement) =>
        Array.from(root.querySelectorAll('button')).map((button) => button.textContent?.trim());

      it('offers to import a closed ID and all the closed ones to someone who writes tasks, and not an open one', async () => {
        asWriter();
        getUntrackedWork.mockResolvedValue([open('X-1'), closed('X-2'), closed('X-3')]);

        const { harness } = await openStructuredLedger();

        const root = harness.routeNativeElement!;
        expect(buttonsOf(root).filter((label) => label === 'Importar como hecha')).toHaveLength(2);
        expect(buttonsOf(root)).toContain('Importar las 2 cerradas como tareas terminadas');
      });

      it('offers nothing to import to someone who cannot write tasks', async () => {
        getUntrackedWork.mockResolvedValue([closed('X-2')]);

        const { harness } = await openStructuredLedger();

        expect(buttonsOf(harness.routeNativeElement!).join(' ')).not.toContain('Importar');
      });

      it('says what it will add, and creates nothing, until the person confirms', async () => {
        asWriter();
        getUntrackedWork.mockResolvedValue([closed('X-2'), closed('X-3')]);
        const { harness, component, text } = await openStructuredLedger();

        component.askImport(['X-2', 'X-3']);
        harness.detectChanges();

        expect(text()).toContain('Se agregarán 2 tareas terminadas al avance del proyecto');
        expect(importUntracked).not.toHaveBeenCalled();
      });

      it('imports the IDs asked for when confirmed, says how many, and reads the list again', async () => {
        asWriter();
        getUntrackedWork
          .mockResolvedValueOnce([closed('X-2'), closed('X-3')])
          .mockResolvedValue([]);
        importUntracked.mockResolvedValue({
          imported: [
            { externalId: 'X-2', taskId: 't2', title: 'Two' },
            { externalId: 'X-3', taskId: 't3', title: 'Three' },
          ],
          skipped: [],
        });
        const { harness, component, text } = await openStructuredLedger();
        component.askImport(['X-2', 'X-3']);

        await component.confirmImport();
        harness.detectChanges();

        expect(importUntracked).toHaveBeenCalledWith('p1', ['X-2', 'X-3']);
        expect(text()).toContain('Se importaron 2 tareas terminadas.');
        expect(component.untrackedWork()).toEqual([]);
        expect(component.confirmingImport()).toBeNull();
      });

      it('says how many were left when some are no longer there or still open', async () => {
        asWriter();
        getUntrackedWork.mockResolvedValue([closed('X-2')]);
        importUntracked.mockResolvedValue({
          imported: [{ externalId: 'X-2', taskId: 't2', title: 'Two' }],
          skipped: [{ externalId: 'X-9', reason: 'OPEN' }],
        });
        const { component } = await openStructuredLedger();
        component.askImport(['X-2', 'X-9']);

        await component.confirmImport();

        expect(component.importNote()).toContain('No se importó 1');
      });

      it('creates nothing when the person cancels', async () => {
        asWriter();
        getUntrackedWork.mockResolvedValue([closed('X-2')]);
        const { component } = await openStructuredLedger();
        component.askImport(['X-2']);

        component.cancelImport();
        await component.confirmImport();

        expect(importUntracked).not.toHaveBeenCalled();
      });

      it('says why it could not import, and keeps the list', async () => {
        asWriter();
        getUntrackedWork.mockResolvedValue([closed('X-2')]);
        importUntracked.mockRejectedValue(new Error('boom'));
        const { component } = await openStructuredLedger();
        component.askImport(['X-2']);

        await component.confirmImport();

        expect(component.importError()).toBe('No se pudo importar.');
        expect(component.untrackedWork()).toHaveLength(1);
        expect(component.importing()).toBe(false);
      });
    });

    it('shows nothing when the ledger has no work without a task', async () => {
      getUntrackedWork.mockResolvedValue([]);

      const { harness } = await openStructuredLedger();

      expect(harness.routeNativeElement!.querySelector('.untracked-work')).toBeNull();
    });

    it('still shows the entries when the list could not be read', async () => {
      getUntrackedWork.mockRejectedValue(new Error('boom'));

      const { text, component } = await openStructuredLedger();

      expect(component.untrackedWork()).toBeNull();
      expect(text()).toContain('Todavía no hay entradas de Agentslog.');
    });
  });

  it('reports a failed load instead of rendering an empty document silently', async () => {
    getRaw.mockRejectedValue(new Error('boom'));
    const { text } = await render();

    expect(text()).toContain('No se pudo cargar este documento.');
  });
});
