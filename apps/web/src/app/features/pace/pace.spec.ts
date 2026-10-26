import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaceService, type PaceForecast, type ProjectPace } from '../../core/pace.service.js';
import { Pace } from './pace.js';

const FORECAST_OK: PaceForecast = {
  status: 'OK',
  openTasks: 9,
  windows: [
    {
      weeks: 2,
      completedPerWeek: 2,
      createdPerWeek: 1,
      finishesBy: '2026-12-30',
      finishesByIgnoringNewScope: '2026-11-29',
    },
    {
      weeks: 4,
      completedPerWeek: 1.5,
      createdPerWeek: 0.5,
      finishesBy: '2026-12-23',
      finishesByIgnoringNewScope: '2026-12-01',
    },
  ],
  range: { from: '2026-12-23', to: '2026-12-30' },
};

const PACE: ProjectPace = {
  generatedAt: '2026-10-28T15:30:00.000Z',
  weeks: [
    { weekStart: '2026-10-12', completed: 1, created: 4, scope: 4, done: 1, partial: false },
    { weekStart: '2026-10-19', completed: 3, created: 2, scope: 6, done: 4, partial: false },
    { weekStart: '2026-10-26', completed: 0, created: 1, scope: 7, done: 4, partial: true },
  ],
  byPhase: [
    {
      phaseId: 'ph1',
      name: 'Build',
      weeks: [
        { weekStart: '2026-10-12', scope: 3, done: 1 },
        { weekStart: '2026-10-19', scope: 4, done: 3 },
        { weekStart: '2026-10-26', scope: 5, done: 3 },
      ],
    },
    {
      phaseId: null,
      name: null,
      weeks: [
        { weekStart: '2026-10-12', scope: 1, done: 0 },
        { weekStart: '2026-10-19', scope: 2, done: 1 },
        { weekStart: '2026-10-26', scope: 2, done: 1 },
      ],
    },
  ],
  forecast: FORECAST_OK,
};

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

describe('Pace (Roadmap TASK-37)', () => {
  let get: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    get = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:projectId', children: [{ path: 'pace', component: Pace }] },
        ]),
        { provide: PaceService, useValue: { get } },
      ],
    });
  });

  async function render() {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/projects/p1/pace', Pace);
    await new Promise((resolve) => setTimeout(resolve));
    harness.detectChanges();
    const root = harness.routeNativeElement!;
    return {
      root,
      text: () => wordsOf(root),
      forecast: () => root.querySelector('.pace-forecast'),
      section: (id: string) => root.querySelector(`section[aria-labelledby="${id}"]`)!,
    };
  }

  const withForecast = (forecast: PaceForecast): ProjectPace => ({ ...PACE, forecast });

  it('shows a loading state before the pace arrives', async () => {
    get.mockReturnValue(new Promise(() => {}));

    expect((await render()).text()).toContain('Cargando');
  });

  it('reads the pace of the project once per visit', async () => {
    get.mockResolvedValue(PACE);
    await render();

    expect(get.mock.calls).toEqual([['p1']]);
  });

  it('says it could not be read, and shows nothing else, when the API fails', async () => {
    get.mockRejectedValue(new Error('down'));
    const { root, text } = await render();

    expect([text(), root.querySelectorAll('table').length]).toEqual([
      'Seguimiento El ritmo del proyecto semana a semana y cuándo terminaría el trabajo abierto, según lo que ya pasó. No se pudo leer el seguimiento. Reintenta en un momento.',
      0,
    ]);
  });

  describe('the forecast', () => {
    it('says the range, with the new work counted, and that it is an estimate', async () => {
      get.mockResolvedValue(PACE);
      const { forecast } = await render();

      expect(wordsOf(forecast()!)).toBe(
        'Al ritmo de las últimas semanas completas, el trabajo abierto (9 tareas) terminaría entre el 23 Dec 2026 y el 30 Dec 2026, contando el trabajo nuevo que sigue llegando. Es una estimación, no una promesa.',
      );
    });

    it('shows the pace of each window and the date it leads to, with and without the new work', async () => {
      get.mockResolvedValue(PACE);
      const { section } = await render();

      const rows = [...section('pace-forecast').querySelectorAll('tbody tr')].map((row) =>
        [...row.querySelectorAll('th, td')].map((cell) => wordsOf(cell)),
      );
      expect(rows).toEqual([
        ['Últimas 2 semanas', '2', '1', '30 Dec 2026', '29 Nov 2026'],
        ['Últimas 4 semanas', '1.5', '0.5', '23 Dec 2026', '1 Dec 2026'],
      ]);
    });

    it('says there is not enough history, instead of a date, when the API does', async () => {
      get.mockResolvedValue(
        withForecast({ status: 'NOT_ENOUGH_HISTORY', openTasks: 3, windows: [], range: null }),
      );
      const { forecast, section } = await render();

      expect([
        wordsOf(forecast()!),
        section('pace-forecast').querySelectorAll('table').length,
      ]).toEqual([
        'No hay historia suficiente para estimar cuándo termina el trabajo: hacen falta al menos 2 semanas completas desde la primera tarea.',
        0,
      ]);
    });

    it('says the work does not end when new work arrives as fast as it closes', async () => {
      get.mockResolvedValue(
        withForecast({
          status: 'NOT_CONVERGING',
          openTasks: 5,
          windows: [
            {
              weeks: 2,
              completedPerWeek: 1,
              createdPerWeek: 1,
              finishesBy: null,
              finishesByIgnoringNewScope: '2026-12-02',
            },
          ],
          range: null,
        }),
      );
      const { forecast, section } = await render();

      expect(wordsOf(forecast()!)).toBe(
        'El trabajo nuevo llega tan rápido como, o más rápido que, el que se cierra: a este ritmo el trabajo abierto (5 tareas) no termina. Sin contar el trabajo nuevo, terminaría hacia el 2 Dec 2026.',
      );
      expect(wordsOf(section('pace-forecast').querySelector('tbody td:nth-child(4)')!)).toBe(
        'no termina',
      );
    });

    it('marks the kind of forecast it shows, for the edge of the sentence', async () => {
      get.mockResolvedValue(PACE);

      expect((await render()).forecast()?.getAttribute('data-status')).toBe('OK');
    });
  });

  describe('the weekly bars', () => {
    it('says in words what was closed and created, and that the last week is not over', async () => {
      get.mockResolvedValue(PACE);
      const { section } = await render();

      expect(wordsOf(section('pace-weekly').querySelector('.pace-sentence')!)).toBe(
        'En las últimas 3 semanas: 4 tareas cerradas y 7 creadas. Se crea más trabajo del que se cierra. La última semana aún no termina.',
      );
    });

    it('has a table with the closed and created tasks of every week', async () => {
      get.mockResolvedValue(PACE);
      const { section } = await render();

      const rows = [...section('pace-weekly').querySelectorAll('tbody tr')].map((row) =>
        [...row.querySelectorAll('th, td')].map((cell) => wordsOf(cell)),
      );
      expect(rows).toEqual([
        ['12 Oct', '1', '4'],
        ['19 Oct', '3', '2'],
        ['26 Oct (en curso)', '0', '1'],
      ]);
    });

    it('draws a pair of bars per week, hidden from a screen reader that has the table', async () => {
      get.mockResolvedValue(PACE);
      const { root } = await render();

      const bars = root.querySelector('.pace-bars')!;
      expect([bars.getAttribute('aria-hidden'), bars.querySelectorAll('.pace-bar').length]).toEqual(
        ['true', 6],
      );
    });

    it('measures the bars against the largest week', async () => {
      get.mockResolvedValue(PACE);
      const { root } = await render();

      const heights = [
        ...root.querySelectorAll<HTMLElement>('.pace-bars__week:first-child .pace-bar'),
      ].map((bar) => bar.style.height);
      expect(heights).toEqual(['25%', '100%']);
    });
  });

  describe('the burn-up', () => {
    it('shows the project first, with its table open, and then a phase each, the tasks of none as "Sin fase"', async () => {
      get.mockResolvedValue(PACE);
      const { section } = await render();

      const burnUp = section('pace-burn-up');
      expect([
        [...burnUp.querySelectorAll('figcaption')].map((caption) => wordsOf(caption)),
        [...burnUp.querySelectorAll('h4')].map((heading) => wordsOf(heading)),
        [...burnUp.querySelectorAll('details')].map((details) => details.open),
      ]).toEqual([
        [
          'Proyecto: el alcance pasó de 4 a 7 tareas y las terminadas, de 1 a 4.',
          'Build: el alcance pasó de 3 a 5 tareas y las terminadas, de 1 a 3.',
          'Sin fase: el alcance pasó de 1 a 2 tareas y las terminadas, de 0 a 1.',
        ],
        ['Build', 'Sin fase'],
        [true, false, false],
      ]);
    });

    it('marks the week in progress in the table of a phase', async () => {
      get.mockResolvedValue(PACE);
      const { section } = await render();

      const lastRow = [...section('pace-burn-up').querySelectorAll('figure')]
        .at(1)!
        .querySelector('tbody tr:last-child th')!;
      expect(wordsOf(lastRow)).toBe('26 Oct (en curso)');
    });
  });

  it('gives every chart a table of its numbers', async () => {
    get.mockResolvedValue(PACE);
    const { root } = await render();

    const charts = root.querySelectorAll('.pace-bars, .burn-up__plot').length;
    const tables = root.querySelectorAll('.pace-numbers table, .burn-up__numbers table').length;
    expect([charts, tables]).toEqual([4, 4]);
  });
});
