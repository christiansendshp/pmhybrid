import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RisksService,
  type ProjectRisks,
  type RiskRef,
  type Semaphore,
} from '../../core/risks.service.js';
import { Risks } from './risks.js';

const ref = (n: number): RiskRef => ({ id: `t${n}`, externalId: `T-${n}`, title: `Task ${n}` });

const NO_COUNTS = {
  UNOWNED_IN_DEVELOPMENT: 0,
  BLOCKED_BY_BLOCKED: 0,
  STALE_IN_DEVELOPMENT: 0,
  OVERDUE: 0,
};

const semaphore = (overrides: Partial<Semaphore> = {}): Semaphore => ({
  light: 'GREEN',
  open: 4,
  blocked: 0,
  counts: NO_COUNTS,
  ...overrides,
});

const RISKS: ProjectRisks = {
  generatedAt: '2026-10-28T12:00:00.000Z',
  staleAfterHours: 72,
  signals: [
    { kind: 'STALE_IN_DEVELOPMENT', task: ref(4), idleHours: 100 },
    { kind: 'OVERDUE', task: ref(1), dueDate: '2026-10-20T00:00:00.000Z' },
    { kind: 'BLOCKED_BY_BLOCKED', task: ref(2), blockedBy: [ref(3)] },
    { kind: 'UNOWNED_IN_DEVELOPMENT', task: ref(5) },
  ],
  criticalPath: [
    { task: ref(3), status: 'PENDIENTE' },
    { task: ref(2), status: 'EN_DESARROLLO' },
  ],
  project: semaphore({
    light: 'RED',
    open: 9,
    blocked: 1,
    counts: {
      UNOWNED_IN_DEVELOPMENT: 1,
      BLOCKED_BY_BLOCKED: 1,
      STALE_IN_DEVELOPMENT: 1,
      OVERDUE: 1,
    },
  }),
  phases: [
    {
      phaseId: 'ph1',
      name: 'Build',
      semaphore: semaphore({ light: 'RED', open: 5, counts: { ...NO_COUNTS, OVERDUE: 1 } }),
    },
    { phaseId: 'ph2', name: 'Ship', semaphore: semaphore({ light: null, open: 0 }) },
  ],
  epics: [{ epicId: 'e1', name: 'Onboarding', semaphore: semaphore({ light: 'GREEN', open: 2 }) }],
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

describe('Risks (Roadmap TASK-45)', () => {
  let get: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    get = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:projectId', children: [{ path: 'risks', component: Risks }] },
        ]),
        { provide: RisksService, useValue: { get } },
      ],
    });
  });

  async function render() {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/projects/p1/risks', Risks);
    await new Promise((resolve) => setTimeout(resolve));
    harness.detectChanges();
    const root = harness.routeNativeElement!;
    return {
      root,
      text: () => wordsOf(root),
      section: (id: string) => root.querySelector(`section[aria-labelledby="${id}"]`)!,
      rows: () =>
        [...root.querySelectorAll('.risks-table tbody tr')].map((row) =>
          [...row.querySelectorAll('th, td')].map((cell) => wordsOf(cell)),
        ),
    };
  }

  it('shows a loading state before the risks arrive', async () => {
    get.mockReturnValue(new Promise(() => {}));

    expect((await render()).text()).toContain('Cargando');
  });

  it('reads the risks of the project once per visit', async () => {
    get.mockResolvedValue(RISKS);
    await render();

    expect(get.mock.calls).toEqual([['p1']]);
  });

  it('says it could not read, and shows nothing else, when the API fails', async () => {
    get.mockRejectedValue(new Error('down'));
    const { root } = await render();

    expect([
      root.querySelector('[role="alert"]')?.textContent?.trim(),
      root.querySelectorAll('section').length,
    ]).toEqual(['No se pudieron leer los riesgos. Reintenta en un momento.', 0]);
  });

  describe('the semaphore', () => {
    it('has a row for the project, each phase and each epic, with the light as a word and why', async () => {
      get.mockResolvedValue(RISKS);
      const { rows } = await render();

      expect(rows()).toEqual([
        [
          'Proyecto',
          'Todo el proyecto',
          '▲ Rojo',
          '9 tareas abiertas: 1 fuera de plazo, 1 espera a una bloqueada, 1 en desarrollo sin responsable, 1 sin actividad en desarrollo, 1 bloqueada',
        ],
        ['Fase', 'Build', '▲ Rojo', '5 tareas abiertas: 1 fuera de plazo'],
        ['Fase', 'Ship', '– Sin trabajo abierto', 'No hay trabajo abierto'],
        ['Épica', 'Onboarding', '● Verde', '2 tareas abiertas, sin señales'],
      ]);
    });

    it('gives each light a shape that is hidden from a screen reader, which has the word', async () => {
      get.mockResolvedValue(RISKS);
      const { root } = await render();

      const marks = [...root.querySelectorAll('.risk-light__mark')];
      expect(marks.every((mark) => mark.getAttribute('aria-hidden') === 'true')).toBe(true);
    });

    it('scrolls inside its own region when it is wider than the screen', async () => {
      get.mockResolvedValue(RISKS);
      const { section } = await render();

      const region = section('risks-lights').querySelector('.table-scroll')!;
      expect([region.getAttribute('role'), region.getAttribute('tabindex')]).toEqual([
        'region',
        '0',
      ]);
    });
  });

  describe('the signals', () => {
    it('groups them by kind, what is late or stuck first, with how many there are', async () => {
      get.mockResolvedValue(RISKS);
      const { section } = await render();

      expect(
        [...section('risks-signals').querySelectorAll('h4')].map((heading) => wordsOf(heading)),
      ).toEqual([
        'Fuera de plazo (1)',
        'Esperan a una tarea bloqueada (1)',
        'En desarrollo y sin responsable (1)',
        'En desarrollo y sin actividad hace más de 3 días (1)',
      ]);
    });

    it('says what is wrong with each task and why, with the task as a link to its page', async () => {
      get.mockResolvedValue(RISKS);
      const { section } = await render();

      const items = [...section('risks-signals').querySelectorAll('.risks-item')].map((item) => [
        wordsOf(item.querySelector('a')!),
        item.querySelector('a')!.getAttribute('href'),
        wordsOf(item.querySelector('.meta-text')!),
      ]);
      expect(items).toEqual([
        ['T-1 Task 1', '/projects/p1/tasks/t1', 'Debía estar terminada el 20 Oct 2026'],
        ['T-2 Task 2', '/projects/p1/tasks/t2', 'Depende de una tarea bloqueada: T-3 Task 3'],
        [
          'T-5 Task 5',
          '/projects/p1/tasks/t5',
          'Está en desarrollo y ni una persona ni un agente la tiene',
        ],
        ['T-4 Task 4', '/projects/p1/tasks/t4', 'Está en desarrollo y lleva 4 días sin actividad'],
      ]);
    });

    it('says there are none when there are none', async () => {
      get.mockResolvedValue({ ...RISKS, signals: [] });
      const { section } = await render();

      expect(wordsOf(section('risks-signals').querySelector('[role="status"]')!)).toBe(
        'No hay señales de riesgo en el trabajo abierto.',
      );
    });
  });

  describe('the critical path', () => {
    it('says how long it is and lists the tasks in order with their status', async () => {
      get.mockResolvedValue(RISKS);
      const { section } = await render();

      const path = section('risks-path');
      expect([
        wordsOf(path.querySelector('.risks-sentence')!),
        [...path.querySelectorAll('ol li')].map((item) => wordsOf(item)),
      ]).toEqual([
        'La cadena más larga de trabajo abierto tiene 2 tareas: T-3 → T-2.',
        ['T-3 Task 3 PENDIENTE', 'T-2 Task 2 EN DESARROLLO'],
      ]);
    });

    it('says there is no chain, and lists nothing, when no task waits on another', async () => {
      get.mockResolvedValue({ ...RISKS, criticalPath: [] });
      const { section } = await render();

      const path = section('risks-path');
      expect([
        wordsOf(path.querySelector('.risks-sentence')!),
        path.querySelectorAll('ol').length,
      ]).toEqual(['Ninguna tarea abierta espera a otra: no hay una cadena que cuide.', 0]);
    });
  });
});
