import { describe, expect, it } from 'vitest';
import {
  extractRoadmapYamlEntries,
  roadmapYamlEntryToRow,
} from './roadmap-yaml-entry.util.js';
import {
  replaceRoadmapRowCells,
  upsertLifecycleRoadmapRow,
} from './roadmap-row-writer.util.js';

const FENCE = '```';

function entryDocument(id: string, lines: string[]): string {
  return [
    '# Roadmap',
    '',
    '## Plan',
    '',
    `### ${id} — Entry`,
    '',
    `${FENCE}yaml`,
    `id: ${id}`,
    'type: TASK',
    'title: Entry',
    'status: READY',
    ...lines,
    FENCE,
    '',
  ].join('\n');
}

const dataOf = (markdown: string, id: string) =>
  extractRoadmapYamlEntries(markdown).find((entry) => entry.id === id)!.data;

describe('the parent of a YAML entry, read (Roadmap GAP-35d)', () => {
  const rowOf = (lines: string[]) =>
    roadmapYamlEntryToRow(
      extractRoadmapYamlEntries(entryDocument('T-1', lines))[0],
    );

  it('reads the parent link', () => {
    expect(rowOf(['parent: EPIC-1']).parentRef).toBe('EPIC-1');
  });

  it('takes the nearest shortcut to an ancestor when there is no parent', () => {
    expect(rowOf(['phase: PH-1', 'epic: EP-1']).parentRef).toBe('EP-1');
    expect(rowOf(['phase: PH-1']).parentRef).toBe('PH-1');
  });

  it('prefers the parent to any shortcut', () => {
    expect(rowOf(['epic: EP-1', 'parent: T-9']).parentRef).toBe('T-9');
  });

  it('says nothing when there is no link, or the link is to the entry itself', () => {
    expect('parentRef' in rowOf([])).toBe(false);
    expect('parentRef' in rowOf(['parent: T-1'])).toBe(false);
    expect('parentRef' in rowOf(['parent: ""'])).toBe(false);
  });
});

describe('the parent of a YAML entry, written (Roadmap GAP-35d)', () => {
  const DOC = entryDocument('T-1', [
    'parent: EP-1',
    'epic: EP-1',
    'phase: PH-1',
  ]);

  it('sets the parent and leaves the shortcuts, which the parent outranks', () => {
    const result = replaceRoadmapRowCells(DOC, 'T-1', { Parent: 'EP-2' });

    expect(result?.replaced).toEqual(['Parent']);
    expect(dataOf(result!.markdown, 'T-1')).toMatchObject({
      parent: 'EP-2',
      epic: 'EP-1',
    });
  });

  it('takes the parent out together with the shortcuts, which would put the task back', () => {
    const result = replaceRoadmapRowCells(DOC, 'T-1', { Parent: '' });

    const data = dataOf(result!.markdown, 'T-1');
    for (const key of ['parent', 'feature', 'epic', 'theme', 'phase']) {
      expect(key in data).toBe(false);
    }
  });

  it('gives a new entry its parent, and makes it a SUBTASK when that is a task', () => {
    const fields = {
      outcome: 'A step',
      acceptanceCheck: 'Done',
      status: 'PENDIENTE',
      owner: null,
      dependsOn: '',
    };

    const underEpic = upsertLifecycleRoadmapRow(DOC, 'T-2', {
      ...fields,
      parent: 'EP-1',
    });
    expect(dataOf(underEpic, 'T-2')).toMatchObject({
      type: 'TASK',
      parent: 'EP-1',
    });

    const underTask = upsertLifecycleRoadmapRow(DOC, 'T-3', {
      ...fields,
      parent: 'T-1',
      subtask: true,
    });
    expect(dataOf(underTask, 'T-3')).toMatchObject({
      type: 'SUBTASK',
      parent: 'T-1',
    });

    const nowhere = upsertLifecycleRoadmapRow(DOC, 'T-4', fields);
    expect('parent' in dataOf(nowhere, 'T-4')).toBe(false);
  });

  it('has no parent to write in a table', () => {
    const table = [
      '# Roadmap',
      '',
      '## Active work',
      '',
      '| ID | Outcome | Acceptance check | Status | Owner | Depends on |',
      '|---|---|---|---|---|---|',
      '| PMH-1 | First task | check it | PENDIENTE | — | — |',
      '',
    ].join('\n');

    const result = replaceRoadmapRowCells(table, 'PMH-1', { Parent: 'EP-1' });

    expect(result?.replaced).toEqual([]);
    expect(result?.markdown).toBe(table);
  });
});
