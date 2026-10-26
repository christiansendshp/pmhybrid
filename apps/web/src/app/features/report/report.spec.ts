import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectContext } from '../../core/project-context.js';
import { ReportService, type SnapshotDay, type StatusReport } from '../../core/report.service.js';
import { PRINTING_CLASS, Report } from './report.js';

const REPORT: StatusReport = {
  generatedAt: '2026-10-28T12:00:00.000Z',
  from: '2026-10-21T12:00:00.000Z',
  to: '2026-10-28T12:00:00.000Z',
  markdown: [
    '# Informe de estado: Website Relaunch',
    '',
    'Semana del 2026-10-21 al 2026-10-28 (UTC).',
    '',
    '## Resumen',
    '',
    '- Progreso: 62 % (12 de 20 tareas terminadas).',
    '',
    '## Qué espera',
    '',
    'Nada está esperando.',
    '',
  ].join('\n'),
};

const DAYS: SnapshotDay[] = [
  {
    day: '2026-10-26',
    source: 'RECONSTRUCTED',
    total: 18,
    done: 9,
    byStatus: null,
    blocked: null,
    openConflicts: null,
    progress: null,
  },
  {
    day: '2026-10-27',
    source: 'RECORDED',
    total: 20,
    done: 12,
    byStatus: { PENDIENTE: 8 },
    blocked: 1,
    openConflicts: 0,
    progress: 60,
  },
];

/** The words of an element, each text on its own: elements side by side are separate words, not one. */
function wordsOf(element: Element): string {
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? '');
    }
    node.childNodes.forEach(walk);
  };
  walk(element);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

describe('Report (Roadmap TASK-49)', () => {
  let report: ReturnType<typeof vi.fn>;
  let snapshots: ReturnType<typeof vi.fn>;
  let writeText: ReturnType<typeof vi.fn>;
  let print: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    report = vi.fn().mockResolvedValue(REPORT);
    snapshots = vi.fn().mockResolvedValue(DAYS);
    writeText = vi.fn().mockResolvedValue(undefined);
    print = vi.fn();
    vi.stubGlobal('print', print);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    TestBed.configureTestingModule({
      providers: [
        ProjectContext,
        provideRouter([
          { path: 'projects/:projectId', children: [{ path: 'report', component: Report }] },
        ]),
        { provide: ReportService, useValue: { report, snapshots } },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.classList.remove(PRINTING_CLASS);
  });

  async function render() {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/projects/p1/report', Report);
    await new Promise((resolve) => setTimeout(resolve));
    harness.detectChanges();
    const root = harness.routeNativeElement!;
    return {
      harness,
      root,
      text: () => wordsOf(root),
      button: (label: string) =>
        [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!,
      settle: async () => {
        await new Promise((resolve) => setTimeout(resolve));
        harness.detectChanges();
      },
      rows: () =>
        [...root.querySelectorAll('.history-table tbody tr')].map((row) =>
          [...row.querySelectorAll('th, td')].map((cell) => wordsOf(cell)),
        ),
    };
  }

  it('shows a loading state before anything arrives', async () => {
    report.mockReturnValue(new Promise(() => {}));
    snapshots.mockReturnValue(new Promise(() => {}));

    expect((await render()).text()).toContain('Cargando');
  });

  it('reads the report and 30 days of history of the project once per visit', async () => {
    await render();

    expect([report.mock.calls, snapshots.mock.calls]).toEqual([[['p1']], [['p1', 30]]]);
  });

  describe('the report', () => {
    it('shows the title, the week and each section under its own heading, as the text it is', async () => {
      const { root } = await render();

      const article = root.querySelector('.report-print')!;
      expect([
        wordsOf(article.querySelector('h4')!),
        wordsOf(article.querySelector('.report__intro')!),
        [...article.querySelectorAll('h5')].map((heading) => wordsOf(heading)),
        article.querySelector('.report__body')?.textContent,
      ]).toEqual([
        'Informe de estado: Website Relaunch',
        'Semana del 2026-10-21 al 2026-10-28 (UTC).',
        ['Resumen', 'Qué espera'],
        '- Progreso: 62 % (12 de 20 tareas terminadas).',
      ]);
    });

    it('puts the Markdown on the clipboard when asked, and says so', async () => {
      const { button, root, settle } = await render();

      button('Copiar Markdown').click();
      await settle();

      expect([writeText.mock.calls, wordsOf(root.querySelector('[role="status"]')!)]).toEqual([
        [[REPORT.markdown]],
        'Copiado.',
      ]);
    });

    it('says it could not copy, and how to do it by hand, when the clipboard refuses', async () => {
      writeText.mockRejectedValue(new Error('denied'));
      const { button, root, settle } = await render();

      button('Copiar Markdown').click();
      await settle();

      expect(wordsOf(root.querySelector('[role="status"]')!)).toBe(
        'No se pudo copiar. Selecciona el texto y cópialo a mano.',
      );
    });

    it('downloads the Markdown as a file named with the project and the day', async () => {
      const created: Blob[] = [];
      Object.defineProperty(URL, 'createObjectURL', {
        value: (blob: Blob) => (created.push(blob), 'blob:report'),
        configurable: true,
      });
      Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
      const downloads: string[] = [];
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        downloads.push(this.download);
      });
      const { button } = await render();

      button('Descargar .md').click();

      expect([downloads, created.length, created[0]?.type]).toEqual([
        ['informe-proyecto-2026-10-28.md'],
        1,
        'text/markdown;charset=utf-8',
      ]);
      click.mockRestore();
    });

    it('prints through the browser, which is how it becomes a PDF', async () => {
      const { button } = await render();

      button('Imprimir o guardar como PDF').click();

      expect(print).toHaveBeenCalledTimes(1);
    });

    it('leaves only the report on the page while the browser prints, and gives the page back after', async () => {
      await render();

      window.dispatchEvent(new Event('beforeprint'));
      const during = document.body.classList.contains(PRINTING_CLASS);
      window.dispatchEvent(new Event('afterprint'));

      expect([during, document.body.classList.contains(PRINTING_CLASS)]).toEqual([true, false]);
    });

    it('keeps the buttons and the history outside the part that is printed', async () => {
      const { root } = await render();

      const printed = root.querySelector('.report-print')!;
      expect([
        printed.querySelectorAll('button').length,
        printed.querySelectorAll('table').length,
      ]).toEqual([0, 0]);
    });

    it('says it could not make the report, with no buttons, and still shows the history', async () => {
      report.mockRejectedValue(new Error('down'));
      const { root } = await render();

      expect([
        wordsOf(root.querySelector('[role="alert"]')!),
        root.querySelectorAll('.report__button').length,
        root.querySelectorAll('.history-table tbody tr').length,
      ]).toEqual(['No se pudo generar el informe. Reintenta en un momento.', 0, 2]);
    });
  });

  describe('the history', () => {
    it('is a table of the days with the tasks, the done ones and the progress, each saying where it comes from', async () => {
      const { rows } = await render();

      expect(rows()).toEqual([
        ['2026-10-26', 'Aproximado', '18', '9', '—'],
        ['2026-10-27', 'Registrado', '20', '12', '60 %'],
      ]);
    });

    it('scrolls inside its own region when it is wider than the screen', async () => {
      const { root } = await render();

      const region = root.querySelector('.history-scroll')!;
      expect([region.getAttribute('role'), region.getAttribute('tabindex')]).toEqual([
        'region',
        '0',
      ]);
    });

    it('says there are no days yet when there are none', async () => {
      snapshots.mockResolvedValue([]);
      const { text } = await render();

      expect(text()).toContain('Todavía no hay días registrados.');
    });

    it('says it could not read, and still shows the report, when the API fails', async () => {
      snapshots.mockRejectedValue(new Error('down'));
      const { root } = await render();

      expect([
        wordsOf(root.querySelector('[role="alert"]')!),
        root.querySelectorAll('.report__body').length,
      ]).toEqual(['No se pudo leer el historial. Reintenta en un momento.', 2]);
    });
  });
});
