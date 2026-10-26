import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ProjectRisks, RiskRef, WaitingTask } from '../../core/risks.service.js';
import { DependenciesView } from './dependencies.js';

const ref = (n: number): RiskRef => ({ id: `t${n}`, externalId: `T-${n}`, title: `Task ${n}` });

const waiting = (
  n: number,
  needs: { n: number; status?: string; blocked?: boolean }[],
  status = 'PENDIENTE',
): WaitingTask => ({
  task: ref(n),
  status,
  waitsOn: needs.map((need) => ({
    task: ref(need.n),
    status: need.status ?? 'EN_DESARROLLO',
    blocked: need.blocked ?? false,
  })),
});

const risks = (overrides: Partial<ProjectRisks> = {}): ProjectRisks => ({
  generatedAt: '2026-10-28T12:00:00.000Z',
  staleAfterHours: 72,
  signals: [],
  criticalPath: [
    { task: ref(1), status: 'PENDIENTE' },
    { task: ref(2), status: 'EN_DESARROLLO' },
  ],
  waiting: [waiting(3, [{ n: 1 }, { n: 2, blocked: true }]), waiting(2, [{ n: 1 }])],
  project: { light: null, open: 0, blocked: 0, counts: {} } as unknown as ProjectRisks['project'],
  phases: [],
  epics: [],
  ...overrides,
});

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

describe('DependenciesView (Roadmap TASK-22)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  function render(inputs: {
    risks?: ProjectRisks | null;
    failed?: boolean;
    visibleTaskIds?: ReadonlySet<string> | null;
  }) {
    const fixture = TestBed.createComponent(DependenciesView);
    fixture.componentRef.setInput('projectId', 'p1');
    fixture.componentRef.setInput('risks', inputs.risks === undefined ? risks() : inputs.risks);
    if (inputs.failed !== undefined) {
      fixture.componentRef.setInput('failed', inputs.failed);
    }
    if (inputs.visibleTaskIds !== undefined) {
      fixture.componentRef.setInput('visibleTaskIds', inputs.visibleTaskIds);
    }
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    return {
      root,
      section: (id: string) => root.querySelector(`section[aria-labelledby="${id}"]`)!,
      entries: () =>
        [...root.querySelectorAll('.deps-entry')].map((entry) => ({
          task: wordsOf(entry.querySelector('.deps-item')!),
          href: entry.querySelector('.deps-item a')!.getAttribute('href'),
          needs: [...entry.querySelectorAll('.deps-needs .deps-item')].map((need) => [
            wordsOf(need),
            need.querySelector('a')!.getAttribute('href'),
          ]),
        })),
    };
  }

  it('says it could not read, and shows no list, when the risks failed', () => {
    const { root } = render({ risks: null, failed: true });

    expect([
      root.querySelector('[role="alert"]')?.textContent?.trim(),
      root.querySelectorAll('section').length,
    ]).toEqual(['No se pudieron leer las dependencias. Reintenta en un momento.', 0]);
  });

  it('shows nothing while the risks are being read', () => {
    expect(render({ risks: null }).root.querySelectorAll('section').length).toBe(0);
  });

  describe('the critical path', () => {
    it('is the one the API gives, in order, with each status and a link to each task', () => {
      const { section } = render({});

      const path = section('deps-path');
      expect([
        wordsOf(path.querySelector('.deps-sentence')!),
        [...path.querySelectorAll('ol li')].map((item) => [
          wordsOf(item),
          item.querySelector('a')!.getAttribute('href'),
        ]),
      ]).toEqual([
        'La cadena más larga de trabajo abierto tiene 2 tareas: T-1 → T-2.',
        [
          ['T-1 Task 1 PENDIENTE', '/projects/p1/tasks/t1'],
          ['T-2 Task 2 EN DESARROLLO', '/projects/p1/tasks/t2'],
        ],
      ]);
    });

    it('says it is the project’s, not the board’s filtered', () => {
      const { section } = render({});

      expect(wordsOf(section('deps-path').querySelector('.meta-text')!)).toBe(
        'De todo el proyecto: no usa los filtros del tablero.',
      );
    });

    it('is not narrowed by the filters', () => {
      const { section } = render({ visibleTaskIds: new Set(['nothing']) });

      expect(section('deps-path').querySelectorAll('ol li').length).toBe(2);
    });

    it('says there is no chain when the API gives none', () => {
      const { section } = render({ risks: risks({ criticalPath: [] }) });

      expect(wordsOf(section('deps-path').querySelector('.deps-sentence')!)).toBe(
        'Ninguna tarea abierta espera a otra: no hay una cadena que cuide.',
      );
    });
  });

  describe('what waits for what', () => {
    it('lists each task that waits, the one that waits for most first, with what it waits for and links to each', () => {
      const { entries } = render({});

      expect(entries()).toEqual([
        {
          task: 'T-3 Task 3 PENDIENTE',
          href: '/projects/p1/tasks/t3',
          needs: [
            ['T-1 Task 1 EN DESARROLLO', '/projects/p1/tasks/t1'],
            ['T-2 Task 2 EN DESARROLLO · bloqueada', '/projects/p1/tasks/t2'],
          ],
        },
        {
          task: 'T-2 Task 2 PENDIENTE',
          href: '/projects/p1/tasks/t2',
          needs: [['T-1 Task 1 EN DESARROLLO', '/projects/p1/tasks/t1']],
        },
      ]);
    });

    it('counts them in a sentence', () => {
      const { section } = render({});

      expect(wordsOf(section('deps-waiting').querySelector('[role="status"]')!)).toBe(
        '2 tareas abiertas esperan a otras, la que espera a más primero.',
      );
    });

    it('says one task in the singular', () => {
      const { section } = render({ risks: risks({ waiting: [waiting(3, [{ n: 1 }])] }) });

      expect(wordsOf(section('deps-waiting').querySelector('[role="status"]')!)).toBe(
        '1 tarea abierta espera a otras, la que espera a más primero.',
      );
    });

    it('keeps the filters: a task they leave out is not listed', () => {
      const { entries, section } = render({ visibleTaskIds: new Set(['t2']) });

      expect([
        entries().map((entry) => entry.task),
        wordsOf(section('deps-waiting').querySelector('[role="status"]')!),
      ]).toEqual([
        ['T-2 Task 2 PENDIENTE'],
        '1 tarea abierta espera a otras, la que espera a más primero.',
      ]);
    });

    it('says no task waits when the filters leave none, or when none does', () => {
      const none = render({ visibleTaskIds: new Set() });
      const empty = render({ risks: risks({ waiting: [] }) });

      expect([
        wordsOf(none.section('deps-waiting').querySelector('[role="status"]')!),
        wordsOf(empty.section('deps-waiting').querySelector('[role="status"]')!),
        none.root.querySelectorAll('.deps-entry').length,
      ]).toEqual([
        'Ninguna tarea abierta espera a otra.',
        'Ninguna tarea abierta espera a otra.',
        0,
      ]);
    });
  });
});
