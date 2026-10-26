import { describe, expect, it } from 'vitest';
import {
  RISK_KINDS,
  hoursText,
  kindHeading,
  lightMark,
  lightWord,
  pathSentence,
  refText,
  semaphoreReason,
  signalReason,
  signalsOfKind,
} from './risks.js';
import type { RiskKind, RiskSignal, Semaphore } from './risks.service.js';

const ref = (n: number, externalId: string | null = `T-${n}`) => ({
  id: `id-${n}`,
  externalId,
  title: `Task ${n}`,
});

const semaphore = (overrides: Partial<Semaphore> = {}): Semaphore => ({
  light: 'GREEN',
  open: 5,
  blocked: 0,
  counts: {
    UNOWNED_IN_DEVELOPMENT: 0,
    BLOCKED_BY_BLOCKED: 0,
    STALE_IN_DEVELOPMENT: 0,
    OVERDUE: 0,
  },
  ...overrides,
});

describe('hoursText (Roadmap TASK-45)', () => {
  it.each([
    [1, '1 h'],
    [47, '47 h'],
    [48, '2 días'],
    [72, '3 días'],
    [8760, '365 días'],
  ])('says %i hours as %s', (hours, text) => {
    expect(hoursText(hours)).toBe(text);
  });
});

describe('refText', () => {
  it('names a task by its ID and title', () => {
    expect(refText(ref(3))).toBe('T-3 Task 3');
  });

  it('names a task with no ID by its title alone', () => {
    expect(refText(ref(3, null))).toBe('Task 3');
  });
});

describe('kindHeading', () => {
  it.each<[RiskKind, string]>([
    ['OVERDUE', 'Fuera de plazo'],
    ['BLOCKED_BY_BLOCKED', 'Esperan a una tarea bloqueada'],
    ['UNOWNED_IN_DEVELOPMENT', 'En desarrollo y sin responsable'],
  ])('says %s', (kind, heading) => {
    expect(kindHeading(kind, 72)).toBe(heading);
  });

  it('says how long a stale task has gone without activity, by the project’s threshold', () => {
    expect(kindHeading('STALE_IN_DEVELOPMENT', 72)).toBe(
      'En desarrollo y sin actividad hace más de 3 días',
    );
  });

  it('says a short threshold in hours', () => {
    expect(kindHeading('STALE_IN_DEVELOPMENT', 12)).toBe(
      'En desarrollo y sin actividad hace más de 12 h',
    );
  });
});

describe('the order of the kinds', () => {
  it('puts what is late or stuck before what is only quiet', () => {
    expect(RISK_KINDS).toEqual([
      'OVERDUE',
      'BLOCKED_BY_BLOCKED',
      'UNOWNED_IN_DEVELOPMENT',
      'STALE_IN_DEVELOPMENT',
    ]);
  });
});

describe('signalReason', () => {
  const signal = (overrides: Partial<RiskSignal>): RiskSignal => ({
    kind: 'OVERDUE',
    task: ref(1),
    ...overrides,
  });

  it('says the date an overdue task was due, as that UTC day', () => {
    expect(
      signalReason(signal({ kind: 'OVERDUE', dueDate: '2026-10-20T23:30:00.000Z' }), 'en-US'),
    ).toBe('Debía estar terminada el 20 Oct 2026');
  });

  it('says a task is overdue even when the date is not there', () => {
    expect(signalReason(signal({ kind: 'OVERDUE' }), 'en-US')).toBe('Pasó su fecha de entrega');
  });

  it('names the blocked tasks a task depends on', () => {
    expect(
      signalReason(
        signal({ kind: 'BLOCKED_BY_BLOCKED', blockedBy: [ref(2), ref(3, null)] }),
        'en-US',
      ),
    ).toBe('Depende de una tarea bloqueada: T-2 Task 2, Task 3');
  });

  it('says it depends on a blocked task even without naming it', () => {
    expect(signalReason(signal({ kind: 'BLOCKED_BY_BLOCKED' }), 'en-US')).toBe(
      'Depende de una tarea bloqueada',
    );
  });

  it('says nobody holds a task in development', () => {
    expect(signalReason(signal({ kind: 'UNOWNED_IN_DEVELOPMENT' }), 'en-US')).toBe(
      'Está en desarrollo y ni una persona ni un agente la tiene',
    );
  });

  it('says how long a task in development has gone without activity', () => {
    expect(signalReason(signal({ kind: 'STALE_IN_DEVELOPMENT', idleHours: 100 }), 'en-US')).toBe(
      'Está en desarrollo y lleva 4 días sin actividad',
    );
  });
});

describe('signalsOfKind', () => {
  it('keeps the signals of a kind, in the order given', () => {
    const signals: RiskSignal[] = [
      { kind: 'OVERDUE', task: ref(1) },
      { kind: 'BLOCKED_BY_BLOCKED', task: ref(2) },
      { kind: 'OVERDUE', task: ref(3) },
    ];

    expect(signalsOfKind(signals, 'OVERDUE').map((signal) => signal.task.id)).toEqual([
      'id-1',
      'id-3',
    ]);
  });
});

describe('lights', () => {
  it.each([
    ['RED', 'Rojo', '▲'],
    ['AMBER', 'Ámbar', '◆'],
    ['GREEN', 'Verde', '●'],
    [null, 'Sin trabajo abierto', '–'],
  ] as const)('says %s as a word and a shape of its own', (light, word, mark) => {
    expect([lightWord(light), lightMark(light)]).toEqual([word, mark]);
  });
});

describe('semaphoreReason', () => {
  it('says there is no open work, for a light with nothing behind it', () => {
    expect(semaphoreReason(semaphore({ light: null, open: 0 }))).toBe('No hay trabajo abierto');
  });

  it('says there are no signals for a green group', () => {
    expect(semaphoreReason(semaphore())).toBe('5 tareas abiertas, sin señales');
  });

  it('says one task in the singular', () => {
    expect(semaphoreReason(semaphore({ open: 1 }))).toBe('1 tarea abierta, sin señales');
  });

  it('counts each signal and the blocked tasks, the late and the stuck first', () => {
    expect(
      semaphoreReason(
        semaphore({
          light: 'RED',
          open: 12,
          blocked: 2,
          counts: {
            UNOWNED_IN_DEVELOPMENT: 1,
            BLOCKED_BY_BLOCKED: 3,
            STALE_IN_DEVELOPMENT: 4,
            OVERDUE: 1,
          },
        }),
      ),
    ).toBe(
      '12 tareas abiertas: 1 fuera de plazo, 3 esperan a una bloqueada, 1 en desarrollo sin responsable, 4 sin actividad en desarrollo, 2 bloqueadas',
    );
  });

  it('says one blocked task in the singular', () => {
    expect(semaphoreReason(semaphore({ light: 'AMBER', blocked: 1 }))).toBe(
      '5 tareas abiertas: 1 bloqueada',
    );
  });
});

describe('pathSentence', () => {
  it('says there is no chain when no open task waits on another', () => {
    expect(pathSentence([])).toBe(
      'Ninguna tarea abierta espera a otra: no hay una cadena que cuide.',
    );
  });

  it('says how long the chain is and lists the tasks in order', () => {
    expect(pathSentence([{ task: ref(1) }, { task: ref(2) }, { task: ref(3, null) }])).toBe(
      'La cadena más larga de trabajo abierto tiene 3 tareas: T-1 → T-2 → Task 3.',
    );
  });
});
