import { describe, expect, it } from 'vitest';
import {
  isStructuralEntry,
  reachesTask,
  resolvePlacements,
  type HierarchyEntry,
} from './roadmap-hierarchy.util.js';

const entry = (
  externalId: string,
  entryType: string,
  parentRef?: string,
): HierarchyEntry => ({ externalId, entryType, parentRef });

describe('resolvePlacements (Roadmap GAP-35d)', () => {
  const spine = [
    entry('VIS-1', 'VISION'),
    entry('PH-1', 'PHASE', 'VIS-1'),
    entry('TH-1', 'THEME', 'PH-1'),
    entry('EP-1', 'EPIC', 'TH-1'),
    entry('FT-1', 'FEATURE', 'EP-1'),
    entry('T-1', 'TASK', 'FT-1'),
    entry('S-1', 'SUBTASK', 'T-1'),
    entry('T-2', 'TASK', 'EP-1'),
    entry('T-3', 'TASK', 'PH-1'),
    entry('T-4', 'TASK'),
  ];

  it('puts an epic in the phase above it, through a theme', () => {
    expect(resolvePlacements(spine).get('EP-1')).toEqual({
      parentTask: null,
      epic: null,
      phase: 'PH-1',
    });
  });

  it('puts a task under an epic in that epic and in its phase', () => {
    expect(resolvePlacements(spine).get('T-2')).toEqual({
      parentTask: null,
      epic: 'EP-1',
      phase: 'PH-1',
    });
  });

  it('puts a task straight under a phase in the phase only', () => {
    expect(resolvePlacements(spine).get('T-3')).toEqual({
      parentTask: null,
      epic: null,
      phase: 'PH-1',
    });
  });

  it('makes a task under work a subtask of it, which then sits where its parent sits', () => {
    const placements = resolvePlacements(spine);
    expect(placements.get('FT-1')).toEqual({
      parentTask: null,
      epic: 'EP-1',
      phase: 'PH-1',
    });
    expect(placements.get('T-1')).toEqual({
      parentTask: 'FT-1',
      epic: null,
      phase: null,
    });
    expect(placements.get('S-1')).toEqual({
      parentTask: 'T-1',
      epic: null,
      phase: null,
    });
  });

  it('says nothing of an entry with no parent', () => {
    expect(resolvePlacements(spine).has('T-4')).toBe(false);
    expect(resolvePlacements(spine).has('VIS-1')).toBe(false);
  });

  it('says nothing of an entry whose parent left the document', () => {
    // A finished entry is taken out of the file.
    const placements = resolvePlacements([entry('T-1', 'TASK', 'EP-GONE')]);
    expect(placements.size).toBe(0);
  });

  it('leaves out every entry of a loop, and only those', () => {
    const placements = resolvePlacements([
      entry('A', 'TASK', 'B'),
      entry('B', 'TASK', 'A'),
      entry('C', 'TASK', 'B'),
      entry('PH-1', 'PHASE'),
      entry('D', 'TASK', 'PH-1'),
    ]);
    expect(placements.has('A')).toBe(false);
    expect(placements.has('B')).toBe(false);
    // A child of the loop is not in it, and is still a subtask of B.
    expect(placements.get('C')).toEqual({
      parentTask: 'B',
      epic: null,
      phase: null,
    });
    expect(placements.get('D')?.phase).toBe('PH-1');
  });

  it('gives an epic under a theme that loops no phase, and does not run forever', () => {
    const placements = resolvePlacements([
      entry('TH-1', 'THEME', 'EP-1'),
      entry('EP-1', 'EPIC', 'TH-1'),
      entry('T-1', 'TASK', 'EP-1'),
    ]);
    expect(placements.get('T-1')).toEqual({
      parentTask: null,
      epic: 'EP-1',
      phase: null,
    });
  });
});

describe('reachesTask', () => {
  const parentOf = new Map<string, string | null>([
    ['c', 'b'],
    ['b', 'a'],
    ['a', null],
    ['x', 'y'],
    ['y', 'x'],
  ]);

  it('is true for the task itself and for any of its ancestors', () => {
    expect(reachesTask(parentOf, 'c', 'c')).toBe(true);
    expect(reachesTask(parentOf, 'c', 'a')).toBe(true);
  });

  it('is false for a task that is not above', () => {
    expect(reachesTask(parentOf, 'a', 'c')).toBe(false);
    expect(reachesTask(parentOf, 'b', 'z')).toBe(false);
  });

  it('stops at a loop that was already there instead of running forever', () => {
    expect(reachesTask(parentOf, 'x', 'a')).toBe(false);
  });
});

describe('isStructuralEntry', () => {
  it('is true for a phase and an epic, and for nothing else', () => {
    expect(isStructuralEntry({ entryType: 'PHASE' })).toBe(true);
    expect(isStructuralEntry({ entryType: 'EPIC' })).toBe(true);
    for (const type of ['THEME', 'VISION', 'FEATURE', 'TASK', 'GAP']) {
      expect(isStructuralEntry({ entryType: type })).toBe(false);
    }
    expect(isStructuralEntry({})).toBe(false);
  });
});
