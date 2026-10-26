import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Waiting, WaitingItem } from '../../core/waiting.service.js';
import { WaitingView } from './waiting.js';

const ago = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

const blocked = (
  overrides: Partial<Extract<WaitingItem, { kind: 'BLOCKED' }>> = {},
): WaitingItem => ({
  kind: 'BLOCKED',
  since: ago(72),
  taskId: 't1',
  externalId: 'T-1',
  title: 'Ship the importer',
  reason: 'Waiting for legal',
  neededDecision: 'PO decision',
  from: 'PO',
  holds: 2,
  ...overrides,
});

const decision = (
  overrides: Partial<Extract<WaitingItem, { kind: 'DECISION' }>> = {},
): WaitingItem => ({
  kind: 'DECISION',
  since: ago(48),
  taskId: 't2',
  externalId: 'T-2',
  title: 'Pick a vendor',
  from: 'PO',
  ...overrides,
});

const conflict = (
  overrides: Partial<Extract<WaitingItem, { kind: 'CONFLICT' }>> = {},
): WaitingItem => ({
  kind: 'CONFLICT',
  since: ago(5),
  conflictId: 'c1',
  conflictKind: 'CONCURRENT_FIELD_EDIT',
  taskId: 't3',
  externalId: 'T-3',
  title: 'Contested task',
  ...overrides,
});

const waiting = (items: WaitingItem[], overrides: Partial<Waiting> = {}): Waiting => ({
  items,
  byPhase: [],
  byEpic: [],
  ledgerUnreadable: false,
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

describe('WaitingView (Roadmap TASK-21)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  function render(inputs: {
    waiting?: Waiting | null;
    failed?: boolean;
    visibleTaskIds?: ReadonlySet<string> | null;
  }) {
    const fixture = TestBed.createComponent(WaitingView);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const text = () => wordsOf(root);
    const items = () => Array.from(root.querySelectorAll('.waiting__item'));
    return { fixture, root, text, items };
  }

  it('says what a blocked task needs, whom it waits for, what it holds back and how long, in words', () => {
    const { items } = render({ waiting: waiting([blocked()]) });

    const text = wordsOf(items()[0]);
    expect(text).toContain('Bloqueada T-1 Ship the importer');
    expect(text).toContain('hace 3 d');
    expect(text).toContain('Waiting for legal');
    expect(text).toContain('Necesita: PO decision');
    expect(text).toContain('Espera a: PO');
    expect(text).toContain('Detiene a 2 tareas.');
  });

  it('says a single task held back in the singular, and nothing when none is', () => {
    const { items } = render({
      waiting: waiting([blocked({ holds: 1 }), blocked({ taskId: 't9', holds: 0 })]),
    });

    expect(items()[0].textContent).toContain('Detiene a 1 tarea.');
    expect(items()[1].textContent).not.toContain('Detiene');
  });

  it('says that the ledger asks for a decision, and that the task is not in the blocked table', () => {
    const { items } = render({ waiting: waiting([decision()]) });

    const text = wordsOf(items()[0]);
    expect(text).toContain('Espera una decisión T-2 Pick a vendor');
    expect(text).toContain('El registro dice que espera a PO.');
    expect(text).toContain('no está en Bloqueadas');
  });

  it('says it waits for an answer when the ledger does not say from whom', () => {
    const { items } = render({ waiting: waiting([decision({ from: null })]) });

    expect(wordsOf(items()[0])).toContain('espera una respuesta.');
  });

  it('says what an open conflict is about, with the way to resolve it', () => {
    const { items } = render({ waiting: waiting([conflict()]) });

    const text = wordsOf(items()[0]);
    expect(text).toContain('Conflicto abierto T-3 Contested task');
    expect(text).toContain('edición simultánea. Resolver');
    expect(items()[0].querySelector('a[href$="/conflicts"]')).not.toBeNull();
  });

  it('links a task to its page', () => {
    const { items } = render({ waiting: waiting([blocked()]) });

    expect(items()[0].querySelector('a.waiting__task')?.getAttribute('href')).toBe('/tasks/t1');
  });

  it('shows the items in the order it is given, the longest waiting first', () => {
    const { items } = render({
      waiting: waiting([decision({ since: ago(100) }), blocked({ since: ago(50) }), conflict()]),
    });

    expect(items().map((item) => item.getAttribute('data-kind'))).toEqual([
      'DECISION',
      'BLOCKED',
      'CONFLICT',
    ]);
  });

  it('counts the waits in a sentence', () => {
    const { text } = render({ waiting: waiting([blocked(), conflict()]) });

    expect(text()).toContain('2 esperas, la más antigua primero.');
  });

  it('says that nothing is waiting', () => {
    const { text, items } = render({ waiting: waiting([]) });

    expect(items()).toHaveLength(0);
    expect(text()).toContain('Nada está esperando.');
  });

  it('keeps the tasks the filters keep, and always shows what is about no task', () => {
    const { items } = render({
      waiting: waiting([
        blocked({ taskId: 'kept' }),
        blocked({ taskId: 'left-out', title: 'Left out' }),
        conflict({ taskId: null, externalId: null, title: null }),
      ]),
      visibleTaskIds: new Set(['kept']),
    });

    expect(items().map((item) => item.getAttribute('data-kind'))).toEqual(['BLOCKED', 'CONFLICT']);
  });

  it('leaves nothing out while no filter is on', () => {
    const { items } = render({
      waiting: waiting([blocked(), decision(), conflict()]),
      visibleTaskIds: null,
    });

    expect(items()).toHaveLength(3);
  });

  it('lists the blocked tasks by phase and by epic, naming the group of none', () => {
    const { text } = render({
      waiting: waiting([blocked()], {
        byPhase: [
          { id: 'p1', name: 'Build', blocked: 2 },
          { id: null, name: null, blocked: 1 },
        ],
        byEpic: [{ id: 'e1', name: 'API', blocked: 3 }],
      }),
    });

    expect(text()).toContain('Por fase Build: 2 Sin fase: 1');
    expect(text()).toContain('Por épica API: 3');
  });

  it('says the ledger could not be read, so the list is known to be incomplete', () => {
    const { text } = render({ waiting: waiting([blocked()], { ledgerUnreadable: true }) });

    expect(text()).toContain('No se pudo leer el registro');
    expect(text()).toContain('no está completa');
  });

  it('says it could not read the list, and shows no list', () => {
    const { text, items } = render({ failed: true });

    expect(text()).toContain('No se pudo leer lo que está esperando.');
    expect(items()).toHaveLength(0);
  });

  it('says it is loading until the list arrives', () => {
    const { text } = render({ waiting: null });

    expect(text()).toContain('Cargando…');
  });
});
