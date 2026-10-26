import { describe, expect, it } from 'vitest';
import {
  risksOf,
  type RiskDependency,
  type RiskKind,
  type RiskTask,
} from './risks.util.js';

const NOW = new Date('2026-10-28T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * HOUR);

const task = (id: string, overrides: Partial<RiskTask> = {}): RiskTask => ({
  id,
  externalId: id.toUpperCase(),
  title: `Task ${id}`,
  status: 'PENDIENTE',
  hasOwner: true,
  blocked: false,
  dueDate: null,
  lastActivityAt: NOW,
  phaseId: null,
  epicId: null,
  ...overrides,
});

const developing = (id: string, overrides: Partial<RiskTask> = {}) =>
  task(id, { status: 'EN_DESARROLLO', ...overrides });

const done = (id: string) => task(id, { status: 'TERMINADA' });

/** `later` waits for `earlier`. */
const dep = (later: string, earlier: string): RiskDependency => ({
  taskId: later,
  dependsOnTaskId: earlier,
});

const read = (
  tasks: RiskTask[],
  dependencies: RiskDependency[] = [],
  staleAfterHours = 72,
) => risksOf({ tasks, dependencies, now: NOW, staleAfterHours });

const idsOf = (
  kind: RiskKind,
  tasks: RiskTask[],
  dependencies: RiskDependency[] = [],
) =>
  read(tasks, dependencies)
    .signals.filter((signal) => signal.kind === kind)
    .map((signal) => signal.task.id);

describe('UNOWNED_IN_DEVELOPMENT (Roadmap TASK-43)', () => {
  it('names a task in development that nobody holds', () => {
    expect(
      idsOf('UNOWNED_IN_DEVELOPMENT', [developing('a', { hasOwner: false })]),
    ).toEqual(['a']);
  });

  it('leaves out a task in development that somebody holds', () => {
    expect(idsOf('UNOWNED_IN_DEVELOPMENT', [developing('a')])).toEqual([]);
  });

  it.each(['PENDIENTE', 'ASIGNADA', 'QA'])(
    'leaves out a task with no owner that is %s: it is not being worked on',
    (status) => {
      expect(
        idsOf('UNOWNED_IN_DEVELOPMENT', [
          task('a', { status, hasOwner: false }),
        ]),
      ).toEqual([]);
    },
  );

  it('leaves out a finished task', () => {
    expect(
      idsOf('UNOWNED_IN_DEVELOPMENT', [{ ...done('a'), hasOwner: false }]),
    ).toEqual([]);
  });
});

describe('BLOCKED_BY_BLOCKED', () => {
  it('names a task that depends on an open task in the Blocked table, and which one', () => {
    const { signals } = read(
      [task('a'), task('b', { blocked: true })],
      [dep('a', 'b')],
    );

    expect(signals).toEqual([
      {
        kind: 'BLOCKED_BY_BLOCKED',
        task: { id: 'a', externalId: 'A', title: 'Task a' },
        blockedBy: [{ id: 'b', externalId: 'B', title: 'Task b' }],
      },
    ]);
  });

  it('names every blocked task it waits on', () => {
    const { signals } = read(
      [task('a'), task('b', { blocked: true }), task('c', { blocked: true })],
      [dep('a', 'c'), dep('a', 'b')],
    );

    expect(signals[0].blockedBy?.map((ref) => ref.id)).toEqual(['b', 'c']);
  });

  it('leaves out a task whose dependency is not blocked', () => {
    expect(
      idsOf('BLOCKED_BY_BLOCKED', [task('a'), task('b')], [dep('a', 'b')]),
    ).toEqual([]);
  });

  it('leaves out a task whose blocked dependency is finished', () => {
    expect(
      idsOf(
        'BLOCKED_BY_BLOCKED',
        [task('a'), { ...done('b'), blocked: true }],
        [dep('a', 'b')],
      ),
    ).toEqual([]);
  });

  it('leaves out a finished task that depended on a blocked one', () => {
    expect(
      idsOf(
        'BLOCKED_BY_BLOCKED',
        [done('a'), task('b', { blocked: true })],
        [dep('a', 'b')],
      ),
    ).toEqual([]);
  });

  it('leaves out a blocked task that depends on nothing blocked: it is blocked, not blocked by a blocked one', () => {
    expect(idsOf('BLOCKED_BY_BLOCKED', [task('a', { blocked: true })])).toEqual(
      [],
    );
  });

  it('ignores a dependency on a task the project does not have', () => {
    expect(
      idsOf('BLOCKED_BY_BLOCKED', [task('a')], [dep('a', 'gone')]),
    ).toEqual([]);
  });
});

describe('STALE_IN_DEVELOPMENT', () => {
  it('names a task in development with no activity for more than the threshold, and for how long', () => {
    const { signals } = read([
      developing('a', { lastActivityAt: hoursAgo(100.5) }),
    ]);

    expect(signals).toEqual([
      {
        kind: 'STALE_IN_DEVELOPMENT',
        task: { id: 'a', externalId: 'A', title: 'Task a' },
        idleHours: 100,
      },
    ]);
  });

  it('leaves out a task idle for exactly the threshold', () => {
    expect(
      idsOf('STALE_IN_DEVELOPMENT', [
        developing('a', { lastActivityAt: hoursAgo(72) }),
      ]),
    ).toEqual([]);
  });

  it('uses the threshold it is given', () => {
    const stale = read(
      [developing('a', { lastActivityAt: hoursAgo(30) })],
      [],
      24,
    ).signals;

    expect(stale.map((signal) => signal.kind)).toEqual([
      'STALE_IN_DEVELOPMENT',
    ]);
  });

  it.each(['PENDIENTE', 'ASIGNADA', 'QA'])(
    'leaves out a task that is %s, however idle',
    (status) => {
      expect(
        idsOf('STALE_IN_DEVELOPMENT', [
          task('a', { status, lastActivityAt: hoursAgo(500) }),
        ]),
      ).toEqual([]);
    },
  );
});

describe('OVERDUE', () => {
  it('names an open task past its due date, and the date', () => {
    const due = hoursAgo(5);

    const { signals } = read([task('a', { dueDate: due })]);

    expect(signals).toEqual([
      {
        kind: 'OVERDUE',
        task: { id: 'a', externalId: 'A', title: 'Task a' },
        dueDate: due.toISOString(),
      },
    ]);
  });

  it.each([
    [
      'a date in the future',
      task('a', { dueDate: new Date(NOW.getTime() + HOUR) }),
    ],
    ['a date that is exactly now', task('a', { dueDate: NOW })],
    ['no date', task('a')],
    ['a finished task past its date', { ...done('a'), dueDate: hoursAgo(5) }],
  ])('leaves out %s', (_label, entry) => {
    expect(idsOf('OVERDUE', [entry])).toEqual([]);
  });
});

describe('the critical path', () => {
  const path = (tasks: RiskTask[], dependencies: RiskDependency[]) =>
    read(tasks, dependencies).criticalPath.map((step) => step.task.id);

  it('is the longest chain of open tasks, the first to do first', () => {
    expect(
      path([task('a'), task('b'), task('c')], [dep('b', 'a'), dep('c', 'b')]),
    ).toEqual(['a', 'b', 'c']);
  });

  it('follows the longer of two branches', () => {
    expect(
      path(
        [task('a'), task('b'), task('c'), task('d'), task('e')],
        [dep('c', 'a'), dep('c', 'b'), dep('b', 'd'), dep('d', 'e')],
      ),
    ).toEqual(['e', 'd', 'b', 'c']);
  });

  it('carries the status of each step', () => {
    const { criticalPath } = read(
      [developing('a'), task('b')],
      [dep('b', 'a')],
    );

    expect(criticalPath.map((step) => step.status)).toEqual([
      'EN_DESARROLLO',
      'PENDIENTE',
    ]);
  });

  it('is not lengthened by a dependency on a finished task', () => {
    expect(
      path([done('a'), task('b'), task('c')], [dep('b', 'a'), dep('c', 'b')]),
    ).toEqual(['b', 'c']);
  });

  it('is empty when no open task waits on another', () => {
    expect(path([task('a'), task('b')], [])).toEqual([]);
  });

  it('is empty when the only dependency is on a finished task', () => {
    expect(path([done('a'), task('b')], [dep('b', 'a')])).toEqual([]);
  });

  it('breaks a dependency cycle at the first task by name instead of looping', () => {
    const cyclic = path(
      [task('a'), task('b'), task('c')],
      [dep('b', 'a'), dep('c', 'b'), dep('a', 'c')],
    );

    expect(cyclic).toEqual(['b', 'c', 'a']);
  });

  it('ignores a task that depends on itself', () => {
    expect(path([task('a')], [dep('a', 'a')])).toEqual([]);
  });

  it('gives the same chain whatever the order of the tasks, when two are as long', () => {
    const tasks = [task('a'), task('b'), task('c'), task('d')];
    const dependencies = [dep('b', 'a'), dep('d', 'c')];

    expect(path([...tasks].reverse(), dependencies)).toEqual(
      path(tasks, dependencies),
    );
  });
});

describe('the semaphore', () => {
  const lights = (tasks: RiskTask[], dependencies: RiskDependency[] = []) =>
    read(tasks, dependencies).project.light;

  it('has no light when nothing is open', () => {
    expect(lights([done('a')])).toBeNull();
  });

  it('is green with open work and no signal', () => {
    expect(lights([task('a')])).toBe('GREEN');
  });

  it.each([
    ['an unowned task in development', [developing('a', { hasOwner: false })]],
    ['a stale task', [developing('a', { lastActivityAt: hoursAgo(200) })]],
    ['a blocked task', [task('a', { blocked: true })]],
  ])('is amber with %s', (_label, tasks) => {
    expect(lights(tasks)).toBe('AMBER');
  });

  it('is red with an overdue task', () => {
    expect(lights([task('a', { dueDate: hoursAgo(1) })])).toBe('RED');
  });

  it('is red with a task blocked by a blocked one', () => {
    expect(
      lights([task('a'), task('b', { blocked: true })], [dep('a', 'b')]),
    ).toBe('RED');
  });

  it('is red when something is both red and amber', () => {
    expect(
      lights([
        task('a', { dueDate: hoursAgo(1) }),
        developing('b', { hasOwner: false }),
      ]),
    ).toBe('RED');
  });

  it('carries the counts that say why', () => {
    const { project } = read(
      [
        developing('a', { hasOwner: false, lastActivityAt: hoursAgo(200) }),
        task('b', { blocked: true }),
        task('c'),
      ],
      [dep('c', 'b')],
    );

    expect(project).toEqual({
      light: 'RED',
      open: 3,
      blocked: 1,
      counts: {
        UNOWNED_IN_DEVELOPMENT: 1,
        BLOCKED_BY_BLOCKED: 1,
        STALE_IN_DEVELOPMENT: 1,
        OVERDUE: 0,
      },
    });
  });

  it('is counted for each phase and each epic by the tasks in it', () => {
    const { byPhase, byEpic } = read([
      task('a', { phaseId: 'p1', epicId: 'e1', dueDate: hoursAgo(1) }),
      task('b', { phaseId: 'p1', epicId: 'e2' }),
      task('c', { phaseId: 'p2' }),
      done('d'),
    ]);

    expect([
      byPhase.map((phase) => [phase.phaseId, phase.light, phase.open]),
      byEpic.map((epic) => [epic.epicId, epic.light, epic.open]),
    ]).toEqual([
      [
        ['p1', 'RED', 2],
        ['p2', 'GREEN', 1],
      ],
      [
        ['e1', 'RED', 1],
        ['e2', 'GREEN', 1],
      ],
    ]);
  });

  it('gives a phase with nothing open no light, and a task of no phase only to the project', () => {
    const { project, byPhase } = read([
      { ...done('a'), phaseId: 'p1' },
      task('b', { dueDate: hoursAgo(1) }),
    ]);

    expect([
      project.light,
      byPhase.map((phase) => [phase.phaseId, phase.light]),
    ]).toEqual(['RED', [['p1', null]]]);
  });
});

describe('an empty project', () => {
  it('has no signals, no path and no light', () => {
    expect(read([])).toEqual({
      signals: [],
      criticalPath: [],
      project: {
        light: null,
        open: 0,
        blocked: 0,
        counts: {
          UNOWNED_IN_DEVELOPMENT: 0,
          BLOCKED_BY_BLOCKED: 0,
          STALE_IN_DEVELOPMENT: 0,
          OVERDUE: 0,
        },
      },
      byPhase: [],
      byEpic: [],
    });
  });
});
