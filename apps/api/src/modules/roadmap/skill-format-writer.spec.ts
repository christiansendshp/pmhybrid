import { describe, expect, it } from 'vitest';
import { TaskStatus } from '@pmhybrid/shared-types';
import { appendAgentslogEntry } from './agentslog-writer.util.js';
import { AgentslogParserService } from './agentslog-parser.service.js';
import { isSkillRoadmap } from './markdown-table.util.js';
import { RoadmapParserService } from './roadmap-parser.service.js';
import {
  removeRoadmapRow,
  replaceRoadmapRowCells,
  upsertLifecycleRoadmapRow,
} from './roadmap-row-writer.util.js';
import { SKILL_AGENTSLOG, SKILL_ROADMAP } from './skill-format.fixtures.js';
import { skillLedgerEntries } from './skill-ledger.util.js';
import {
  rowStatusDiffers,
  workflowStatusFor,
} from './status-vocabulary.util.js';

/**
 * Write-back into a document in the latest skill's format must leave a file
 * the skill's own `check` accepts and edit the row where it is (Roadmap
 * GAP-37b).
 */
describe('Roadmap rows written into the latest skill format (Roadmap GAP-37b)', () => {
  const parser = new RoadmapParserService();
  const rowOf = (markdown: string, id: string) =>
    parser.parse(markdown).find((row) => row.externalId === id)!;
  const lifecycle = (markdown: string, id: string, status: string) =>
    upsertLifecycleRoadmapRow(markdown, id, {
      outcome: 'Anything',
      acceptanceCheck: 'anything',
      status,
      owner: { name: 'ana', kind: 'HUMAN' },
      dependsOn: '—',
    });

  it('recognizes the format by the Pause reason column, and no other', () => {
    expect(isSkillRoadmap(SKILL_ROADMAP)).toBe(true);
    expect(
      isSkillRoadmap(
        '| ID | Outcome | Acceptance check | Status | Owner | Depends on |\n|---|---|---|---|---|---|\n| A | b | c | TODO | — | — |\n',
      ),
    ).toBe(false);
  });

  it('maps every Kanban state to a word the skill accepts, and refuses one it does not know', () => {
    expect(
      Object.values(TaskStatus).map((status) => workflowStatusFor(status)),
    ).toEqual(['TODO', 'TODO', 'IN_PROGRESS', 'IN_PROGRESS', 'DONE']);
    expect(workflowStatusFor('EN DESARROLLO')).toBe('IN_PROGRESS');
    expect(() => workflowStatusFor('WIP')).toThrow(/No workflow status/);
  });

  it('edits a Plan row and a Gaps row in place instead of appending a duplicate to Active work', () => {
    const plan = lifecycle(SKILL_ROADMAP, 'F01-E01-T05', 'EN_DESARROLLO');
    const gap = lifecycle(plan, 'F01-BUG-01', 'TERMINADA');

    expect(gap.match(/F01-E01-T05/g)).toHaveLength(
      SKILL_ROADMAP.match(/F01-E01-T05/g)!.length,
    );
    expect(rowOf(gap, 'F01-E01-T05')).toMatchObject({
      statusRaw: 'IN_PROGRESS',
    });
    expect(rowOf(gap, 'F01-BUG-01')).toMatchObject({ statusRaw: 'DONE' });
    // The lifecycle write renders the task's title into the row's text column.
    expect(rowOf(gap, 'F01-BUG-01').outcome).toBe('Anything');
    // Nothing else moved: the epic's other row is as it was.
    expect(rowOf(gap, 'F01-E01-T06')).toEqual(
      rowOf(SKILL_ROADMAP, 'F01-E01-T06'),
    );
  });

  it('writes only skill words in the Status cell of a new row and of an edited one', () => {
    const created = lifecycle(SKILL_ROADMAP, 'PMH-1', 'ASIGNADA');
    expect(rowOf(created, 'PMH-1')).toMatchObject({
      statusRaw: 'TODO',
      table: 'ACTIVE',
    });
    // The new row has all seven cells, the reason among them.
    expect(created).toMatch(
      /\| PMH-1 \| Anything \| anything \| TODO \| ana \| — \| — \|/,
    );

    const statuses = [
      ...created.matchAll(/^\|.*\| (TODO|IN_PROGRESS|PAUSE|DONE) \|/gm),
    ];
    expect(statuses.length).toBeGreaterThan(8);
  });

  it('keeps a PAUSE row paused through a lifecycle write, and clears the reason only when it is completed', () => {
    const kept = lifecycle(SKILL_ROADMAP, 'F01-E01-T02', 'EN_DESARROLLO');
    expect(rowOf(kept, 'F01-E01-T02')).toMatchObject({
      statusRaw: 'PAUSE',
      pauseReason: 'BLOQUEO - waiting for the schema review',
    });

    const done = lifecycle(SKILL_ROADMAP, 'F01-E01-T02', 'TERMINADA');
    const finished = rowOf(done, 'F01-E01-T02');
    expect(finished.statusRaw).toBe('DONE');
    expect(finished.pauseReason).toBeUndefined();
    expect(finished.blocker).toBeUndefined();
  });

  it('writes a title edit to the Description of a Gaps row and reports it as written', () => {
    const edited = replaceRoadmapRowCells(SKILL_ROADMAP, 'F01-BUG-01', {
      Outcome: 'The importer keeps the last row',
    });

    expect(edited?.replaced).toEqual(['Outcome']);
    expect(rowOf(edited!.markdown, 'F01-BUG-01').outcome).toBe(
      'The importer keeps the last row',
    );
  });

  it('writes a status edit as a skill word, but leaves a paused row paused', () => {
    const started = replaceRoadmapRowCells(SKILL_ROADMAP, 'F01-E01-T05', {
      Status: 'QA',
    });
    expect(started?.replaced).toEqual(['Status']);
    expect(rowOf(started!.markdown, 'F01-E01-T05').statusRaw).toBe(
      'IN_PROGRESS',
    );

    const paused = replaceRoadmapRowCells(SKILL_ROADMAP, 'F01-E01-T03', {
      Status: 'EN_DESARROLLO',
    });
    expect(paused?.replaced).toEqual([]);
    expect(paused?.markdown).toBe(SKILL_ROADMAP);
  });

  it('removes a row from any table, and puts the placeholder back in a table left empty', () => {
    const withoutGap = removeRoadmapRow(SKILL_ROADMAP, 'F01-BUG-01')!;
    expect(withoutGap).not.toMatch(/^\| F01-BUG-01 \|/m);
    // The row that named it as a dependency still does: only the row is gone.
    expect(withoutGap).toContain('| F01-DEBT-01 |');

    const nearTerm = removeRoadmapRow(SKILL_ROADMAP, 'F02-E01-T01')!;
    expect(nearTerm).toContain('| — | — | — | — | — |');
    expect(removeRoadmapRow(SKILL_ROADMAP, 'NOPE-1')).toBeNull();
  });
});

describe('Status equivalence between the skill vocabulary and the board (Roadmap GAP-37b)', () => {
  const row = (statusRaw: string, statusMapped: TaskStatus | null) => ({
    statusRaw,
    statusMapped,
  });

  it('counts TODO as the same state as ASIGNADA and IN_PROGRESS as the same as QA', () => {
    expect(
      rowStatusDiffers(row('TODO', TaskStatus.PENDIENTE), 'ASIGNADA'),
    ).toBe(false);
    expect(
      rowStatusDiffers(row('IN_PROGRESS', TaskStatus.EN_DESARROLLO), 'QA'),
    ).toBe(false);
  });

  it('still sees a real change, and a board word the document wrote itself', () => {
    expect(rowStatusDiffers(row('DONE', TaskStatus.TERMINADA), 'QA')).toBe(
      true,
    );
    expect(
      rowStatusDiffers(
        row('IN_PROGRESS', TaskStatus.EN_DESARROLLO),
        'PENDIENTE',
      ),
    ).toBe(true);
    // A verbatim board word is not a coarse one: QA against EN_DESARROLLO differs.
    expect(rowStatusDiffers(row('QA', TaskStatus.QA), 'EN_DESARROLLO')).toBe(
      true,
    );
    // PAUSE (no column) and a missing status say nothing.
    expect(rowStatusDiffers(row('PAUSE', null), 'QA')).toBe(false);
    expect(rowStatusDiffers({}, 'QA')).toBe(false);
  });
});

describe('Ledger entries PM Hub writes into a latest-skill project (Roadmap GAP-37b)', () => {
  const at = '2026-09-21T16:00:00.000Z';
  const historyOf = (markdown: string, id: string) =>
    new AgentslogParserService()
      .parse(markdown)
      .entries.filter((entry) => entry.taskExternalId === id);
  const entries = (
    trigger: Parameters<typeof skillLedgerEntries>[0]['trigger'],
    history: ReturnType<typeof historyOf>,
    assigneeName: string | null = null,
  ) =>
    skillLedgerEntries({
      trigger,
      timestampIso: at,
      taskExternalId: 'F01-E01-T01',
      title: 'Ship the importer',
      requesterName: 'Christian',
      assigneeName,
      history,
    });

  it('writes nothing for a created task: the skill has no such state', () => {
    expect(entries('CREATED', [])).toEqual([]);
  });

  it('starts a task as IN_PROGRESS with Verify pending, to whoever holds it — and never claims a held one twice', () => {
    expect(entries('STATUS_EN_DESARROLLO', [], 'codex')).toEqual([
      expect.objectContaining({
        agentName: 'codex',
        statusWord: 'IN_PROGRESS',
        verify: 'pending',
      }),
    ]);
    expect(entries('STATUS_EN_DESARROLLO', [], null)[0].agentName).toBe(
      'Christian',
    );
    // F01-E01-T01 is already IN_PROGRESS by claude in the upstream-shaped ledger.
    expect(
      entries(
        'STATUS_EN_DESARROLLO',
        historyOf(SKILL_AGENTSLOG, 'F01-E01-T01'),
        'codex',
      ),
    ).toEqual([]);
  });

  it('completes a task as DONE with a Verify the skill accepts and that says what happened', () => {
    const [done] = entries('STATUS_TERMINADA', []);

    expect(done).toMatchObject({ statusWord: 'DONE', agentName: 'Christian' });
    expect(done.verify).toMatch(/marked done in PM Hub/);
    expect(done.verify).not.toBe('pending');
    expect(done.files).toBeUndefined();
    expect(done.followUp).toBeUndefined();
  });

  it('hands a held task over as a PAUSE for the previous holder and an IN_PROGRESS for the new one', () => {
    const result = entries(
      'LOCKED_REASSIGN',
      historyOf(SKILL_AGENTSLOG, 'F01-E01-T01'),
      'codex',
    );

    expect(result.map((entry) => [entry.agentName, entry.statusWord])).toEqual([
      ['claude', 'PAUSE'],
      ['codex', 'IN_PROGRESS'],
    ]);
    expect(result[0].pause).toBe('OTRO - reassigned in PM Hub to codex');
    // Handing it to the holder, or to nobody, changes nothing.
    expect(
      entries(
        'LOCKED_REASSIGN',
        historyOf(SKILL_AGENTSLOG, 'F01-E01-T01'),
        'claude',
      ),
    ).toEqual([]);
    expect(entries('LOCKED_REASSIGN', [], null)).toEqual([]);
  });

  it('produces a ledger the skill format reads back with every state valid', () => {
    let log = SKILL_AGENTSLOG;
    for (const entry of [
      ...entries('LOCKED_REASSIGN', historyOf(log, 'F01-E01-T01'), 'codex'),
      ...entries('STATUS_TERMINADA', []),
    ]) {
      log = appendAgentslogEntry(log, entry);
    }

    const states = historyOf(log, 'F01-E01-T01').map(
      (entry) => entry.statusWord,
    );
    expect(states).toEqual(['IN_PROGRESS', 'PAUSE', 'IN_PROGRESS', 'DONE']);
    const pause = historyOf(log, 'F01-E01-T01')[1];
    expect(pause.pause).toMatch(/^OTRO - .+/);
    expect(historyOf(log, 'F01-E01-T01')[3].verify).not.toBe('');
  });
});
