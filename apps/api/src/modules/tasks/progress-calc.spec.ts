import { describe, expect, it } from 'vitest';
import { ProgressCalculator, type RollupTask } from './progress-calc.js';

const task = (overrides: Partial<RollupTask> & { id: string }): RollupTask => ({
  parentTaskId: null,
  phaseId: null,
  epicId: null,
  status: 'PENDIENTE',
  progressPercent: null,
  ...overrides,
});

describe('ProgressCalculator (Roadmap IMPROVEMENT-01c)', () => {
  it('uses a leaf’s own percent, else what its status implies', () => {
    const tasks = [
      task({ id: 'a', status: 'PENDIENTE' }),
      task({ id: 'b', status: 'ASIGNADA' }),
      task({ id: 'c', status: 'EN_DESARROLLO' }),
      task({ id: 'd', status: 'QA' }),
      task({ id: 'e', status: 'TERMINADA' }),
      task({ id: 'f', status: 'PENDIENTE', progressPercent: 30 }),
    ];
    const calc = new ProgressCalculator(tasks, [], []);

    expect(tasks.map((t) => calc.task(t))).toEqual([0, 0, 50, 80, 100, 30]);
  });

  it('averages a parent’s subtasks, recursively, ignoring the parent’s own percent', () => {
    const tasks = [
      task({ id: 'p', progressPercent: 99 }),
      task({ id: 'c1', parentTaskId: 'p', status: 'TERMINADA' }),
      task({ id: 'c2', parentTaskId: 'p', status: 'PENDIENTE' }),
      task({ id: 'g1', parentTaskId: 'c2', progressPercent: 40 }),
      task({ id: 'g2', parentTaskId: 'c2', progressPercent: 60 }),
    ];
    const calc = new ProgressCalculator(tasks, [], []);

    // c2 = avg(40, 60) = 50; p = avg(100, 50) = 75.
    expect(calc.task(tasks[0])).toBe(75);
  });

  it('rolls tasks up into epics, epics and direct tasks into phases, and phases into the project', () => {
    const tasks = [
      task({ id: 'e1', epicId: 'E', phaseId: 'P', status: 'TERMINADA' }),
      task({ id: 'e2', epicId: 'E', phaseId: 'P', status: 'PENDIENTE' }),
      task({ id: 'direct', phaseId: 'P', progressPercent: 100 }),
      task({ id: 'orphan', progressPercent: 20 }),
    ];
    const calc = new ProgressCalculator(
      tasks,
      [{ id: 'E', phaseId: 'P' }],
      [{ id: 'P' }],
    );

    expect(calc.epic('E')).toBe(50);
    // The phase averages its epic (50) and its direct task (100).
    expect(calc.phase('P')).toBe(75);
    // The project averages its phase (75) and the orphan task (20).
    expect(calc.project()).toBe(47.5);
  });

  it('says null for containers with nothing to average, and never counts them as zero', () => {
    const calc = new ProgressCalculator(
      [task({ id: 'x', progressPercent: 100 })],
      [{ id: 'EmptyEpic', phaseId: null }],
      [{ id: 'EmptyPhase' }],
    );

    expect(calc.epic('EmptyEpic')).toBeNull();
    expect(calc.phase('EmptyPhase')).toBeNull();
    // Only the task counts: the empty epic and phase are left out of the average.
    expect(calc.project()).toBe(100);
    expect(new ProgressCalculator([], [], []).project()).toBeNull();
  });

  it('counts an epic’s task under the epic only, not again under its phase', () => {
    const calc = new ProgressCalculator(
      [task({ id: 't', epicId: 'E', phaseId: 'P', progressPercent: 100 })],
      [{ id: 'E', phaseId: 'P' }],
      [{ id: 'P' }],
    );

    expect(calc.phase('P')).toBe(100);
    expect(calc.project()).toBe(100);
  });
});
