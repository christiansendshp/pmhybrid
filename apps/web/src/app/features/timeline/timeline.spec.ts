import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Phase } from '../../core/hierarchy.service.js';
import type { TaskCard } from '../../core/tasks.service.js';
import type { LedgerSpans } from '../../core/timeline.js';
import { Timeline } from './timeline.js';

const NOW = new Date('2026-10-13T12:00:00Z').getTime();

let sequence = 0;
function card(overrides: Partial<TaskCard> = {}): TaskCard {
  sequence += 1;
  return {
    id: `t${sequence}`,
    externalId: `PMH-${sequence}`,
    title: `Task ${sequence}`,
    status: 'EN_DESARROLLO',
    phaseId: 'p1',
    instantClose: false,
    rowGone: false,
    completedAt: null,
    statusChangedAt: '2026-10-12T00:00:00.000Z',
    createdAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  } as TaskCard;
}

const phases: Phase[] = [
  { id: 'p1', projectId: 'x', name: 'Discovery', order: 1, description: null, status: null },
  { id: 'p2', projectId: 'x', name: 'Build', order: 2, description: null, status: null },
];

describe('Timeline (Roadmap TASK-23)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  function render(cards: TaskCard[], spans: LedgerSpans = {}, spansFailed = false) {
    const fixture = TestBed.createComponent(Timeline);
    fixture.componentRef.setInput('cards', cards);
    fixture.componentRef.setInput('spans', spans);
    fixture.componentRef.setInput('phases', phases);
    fixture.componentRef.setInput('now', NOW);
    fixture.componentRef.setInput('spansFailed', spansFailed);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  const toggles = (root: HTMLElement) =>
    Array.from(root.querySelectorAll<HTMLButtonElement>('.timeline-phase__toggle'));

  it('says in words what a phase holds: how many tasks, the span it covers and how many were never started (AC-2)', () => {
    const { root } = render(
      [
        card({ externalId: 'A' }),
        card({ externalId: 'B', status: 'PENDIENTE' }),
        card({ externalId: 'C', status: 'ASIGNADA' }),
      ],
      { A: { startedAt: '2026-10-05T10:00:00Z', doneAt: null } },
    );

    const facts = (root.querySelector('.timeline-phase__facts')?.textContent ?? '').replace(
      /\s+/g,
      ' ',
    );

    expect(facts).toContain('3 tareas');
    expect(facts).toMatch(/5 oct.*13 oct/i);
    expect(facts).toContain('2 sin iniciar');
  });

  it('names the phase of each group, in its order, and leaves the tasks of no phase for last', () => {
    const { root } = render([
      card({ phaseId: null }),
      card({ phaseId: 'p2' }),
      card({ phaseId: 'p1' }),
    ]);

    expect(
      toggles(root).map((button) => button.textContent?.replace(/[▾▸\s]+/g, ' ').trim()),
    ).toEqual(['Discovery', 'Build', 'Sin fase']);
  });

  it('draws a closed instantly as a mark and an open task as an open bar, never a zero-width bar (AC-1)', () => {
    const { root } = render(
      [
        card({ externalId: 'FAST', status: 'TERMINADA', instantClose: true }),
        card({ externalId: 'OPEN' }),
      ],
      {
        FAST: { startedAt: '2026-10-05T10:00:00Z', doneAt: '2026-10-05T10:02:00Z' },
        OPEN: { startedAt: '2026-10-06T10:00:00Z', doneAt: null },
      },
    );

    expect(root.querySelectorAll('.timeline-row .timeline-mark')).toHaveLength(1);
    const bars = root.querySelectorAll<HTMLElement>('.timeline-row .timeline-bar');
    expect(bars).toHaveLength(1);
    expect(bars[0].classList.contains('timeline-bar--open')).toBe(true);
    expect(Number.parseFloat(bars[0].style.width)).toBeGreaterThan(0);
  });

  it('says where the dates of a row come from, in words, for both kinds', () => {
    const { root } = render([card({ externalId: 'LED' }), card({ externalId: 'REC' })], {
      LED: { startedAt: '2026-10-05T10:00:00Z', doneAt: null },
    });

    const whens = Array.from(root.querySelectorAll('.timeline-row__when')).map(
      (when) => when.textContent ?? '',
    );

    expect(whens.some((when) => when.includes('fechas del registro de agentes'))).toBe(true);
    expect(whens.some((when) => when.includes('fechas de la tarea, sin registro de agentes'))).toBe(
      true,
    );
  });

  it('hides the drawing from assistive technology: everything it says is in the rows’ words', () => {
    const { root } = render([card({ externalId: 'A' })], {
      A: { startedAt: '2026-10-05T10:00:00Z', doneAt: null },
    });

    expect(
      root.querySelector('.timeline-row .timeline-row__track')?.getAttribute('aria-hidden'),
    ).toBe('true');
    expect(root.querySelector('.timeline-axis')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('closes and opens a phase with its button, and says which with aria-expanded', () => {
    const { fixture, root } = render([card({ externalId: 'A' })], {
      A: { startedAt: '2026-10-05T10:00:00Z', doneAt: null },
    });
    const [button] = toggles(root);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelectorAll('.timeline-row')).toHaveLength(1);

    button.click();
    fixture.detectChanges();

    expect(toggles(root)[0].getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelectorAll('.timeline-row')).toHaveLength(0);
  });

  it('closes every phase that has nothing open when there are too many rows to read, and Abrir todas opens them', () => {
    const finished = Array.from({ length: 81 }, (_, index) =>
      card({
        externalId: `D-${index}`,
        phaseId: 'p1',
        status: 'TERMINADA',
        completedAt: '2026-10-07T10:00:00Z',
      }),
    );
    const spans = Object.fromEntries(
      finished.map((task) => [
        task.externalId as string,
        { startedAt: '2026-10-05T10:00:00Z', doneAt: '2026-10-07T10:00:00Z' },
      ]),
    );
    const { fixture, root } = render([...finished, card({ externalId: 'OPEN', phaseId: 'p2' })], {
      ...spans,
      OPEN: { startedAt: '2026-10-06T10:00:00Z', doneAt: null },
    });

    const [discovery, build] = toggles(root);
    expect(discovery.getAttribute('aria-expanded')).toBe('false');
    expect(build.getAttribute('aria-expanded')).toBe('true');

    const openAll = Array.from(root.querySelectorAll<HTMLButtonElement>('.timeline__link')).find(
      (link) => link.textContent?.includes('Abrir todas'),
    )!;
    openAll.click();
    fixture.detectChanges();

    expect(toggles(root).every((button) => button.getAttribute('aria-expanded') === 'true')).toBe(
      true,
    );
    expect(root.querySelectorAll('.timeline-row')).toHaveLength(82);
  });

  it('says there is nothing to draw when the filters leave no task', () => {
    const { root } = render([]);

    expect(root.querySelector('.timeline__empty')?.textContent).toContain('No hay tareas');
    expect(root.querySelector('.timeline-phase')).toBeNull();
  });

  it('says so when the ledger could not be read', () => {
    const { root } = render([card()], {}, true);

    expect(root.querySelector('.timeline__note')?.textContent).toContain(
      'No se pudo leer el registro de agentes',
    );
  });

  it('names the threshold of an instant close in the legend', () => {
    const fixture = TestBed.createComponent(Timeline);
    fixture.componentRef.setInput('cards', [card()]);
    fixture.componentRef.setInput('spans', {});
    fixture.componentRef.setInput('phases', phases);
    fixture.componentRef.setInput('instantMinutes', 15);
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.timeline__legend')?.textContent,
    ).toContain('menos de 15 min');
  });
});
