import { describe, expect, it } from 'vitest';
import { appendAgentslogEntry } from './agentslog-writer.util.js';
import {
  AgentslogParserService,
  type ParsedAgentLogEntry,
} from './agentslog-parser.service.js';
import { SKILL_ROADMAP } from './skill-format.fixtures.js';
import {
  acceptsReviewEntries,
  skillLedgerEntries,
} from './skill-ledger.util.js';

/**
 * The review stage PM Hub writes into the ledger of a project that opted in:
 * the handoff to QA, its approval and its return (Roadmap TASK-08, GAP-40).
 */
describe('QA handoff entries in a ledger that accepts the review stage (Roadmap TASK-08)', () => {
  const ID = 'F01-E01-T01';
  const BASE = '# Agents log\n\n## Entries\n';
  const stamp = (n: number) => `2026-10-26T1${n}:00:00.000Z`;

  /** The entries of the ledger the given steps produce, oldest first, as the parser reads them. */
  const historyOf = (
    steps: Array<[agent: string, status: string, rest?: object]>,
  ): ParsedAgentLogEntry[] => {
    let log = BASE;
    steps.forEach(([agentName, statusWord, rest], index) => {
      log = appendAgentslogEntry(log, {
        timestampIso: stamp(index),
        agentName,
        taskExternalId: ID,
        statusWord,
        summary: `${statusWord} by ${agentName}`,
        ...rest,
      });
    });
    return new AgentslogParserService()
      .parse(log)
      .entries.filter((entry) => entry.taskExternalId === ID);
  };

  const developing = historyOf([
    ['claude', 'IN_PROGRESS', { verify: 'pending' }],
  ]);
  const handedOver = historyOf([
    ['claude', 'IN_PROGRESS', { verify: 'pending' }],
    ['claude', 'REVIEW', { verify: 'checked', handoff: 'ana' }],
  ]);

  const entries = (
    trigger: Parameters<typeof skillLedgerEntries>[0]['trigger'],
    history: ParsedAgentLogEntry[],
    rest: Partial<Parameters<typeof skillLedgerEntries>[0]> = {},
  ) =>
    skillLedgerEntries({
      trigger,
      timestampIso: '2026-10-26T20:00:00.000Z',
      taskExternalId: ID,
      title: 'Ship the importer',
      requesterName: 'ana',
      assigneeName: 'claude',
      history,
      qaHandoff: true,
      ...rest,
    });
  const shape = (written: ReturnType<typeof entries>) =>
    written.map((entry) => [entry.agentName, entry.statusWord]);

  describe('the handoff', () => {
    it('writes a REVIEW entry in the holder name, with the reviewer as the Handoff', () => {
      const [review] = entries('STATUS_QA', developing, {
        reviewerName: 'ana',
      });

      expect(review).toMatchObject({
        agentName: 'claude',
        statusWord: 'REVIEW',
        handoff: 'ana',
      });
    });

    it('writes no Handoff bullet when nobody was asked to review', () => {
      const [review] = entries('STATUS_QA', developing);

      expect(review.handoff).toBeUndefined();
    });

    it('gives the REVIEW entry a Verify that says what happened, because the skill refuses an empty or pending one', () => {
      const [review] = entries('STATUS_QA', developing);

      expect(review.verify).toBe(
        'moved to QA in PM Hub by ana; no automated check ran',
      );
    });

    it('carries the note the person gave into the Summary', () => {
      const [review] = entries('STATUS_QA', developing, {
        note: 'importer done, please check the CSV edge cases',
      });

      expect(review.summary).toBe(
        'Handed to review: Ship the importer - importer done, please check the CSV edge cases',
      );
    });

    it('takes a task nobody holds before handing it over, so the hold agent is the one who hands it', () => {
      const written = entries('STATUS_QA', [], { assigneeName: 'codex' });

      expect(shape(written)).toEqual([
        ['codex', 'IN_PROGRESS'],
        ['codex', 'REVIEW'],
      ]);
    });

    it('names the requester when nobody holds the task and nobody is assigned', () => {
      const written = entries('STATUS_QA', [], { assigneeName: null });

      expect(shape(written)).toEqual([
        ['ana', 'IN_PROGRESS'],
        ['ana', 'REVIEW'],
      ]);
    });

    it('hands over under the agent that holds it, not the assignee PM Hub has now', () => {
      const [review] = entries('STATUS_QA', developing, {
        assigneeName: 'codex',
      });

      expect(review.agentName).toBe('claude');
    });

    it('writes nothing for a handoff the reviewer already has', () => {
      expect(entries('STATUS_QA', handedOver)).toEqual([]);
    });

    it('takes the task again before a new handoff when the last review has been answered', () => {
      const failed = historyOf([
        ['claude', 'IN_PROGRESS', { verify: 'pending' }],
        ['claude', 'REVIEW', { verify: 'checked' }],
        ['ana', 'REVIEW', { review: 'FAIL - missing tests' }],
      ]);

      expect(shape(entries('STATUS_QA', failed))).toEqual([
        ['claude', 'IN_PROGRESS'],
        ['claude', 'REVIEW'],
      ]);
    });

    it('writes nothing in a project that did not opt in', () => {
      expect(entries('STATUS_QA', developing, { qaHandoff: false })).toEqual(
        [],
      );
    });
  });

  describe('the approval', () => {
    it('passes the review in the approver name, then closes the task with the DONE the skill lets that reviewer write', () => {
      const written = entries('STATUS_TERMINADA', handedOver);

      expect(shape(written)).toEqual([
        ['ana', 'REVIEW'],
        ['ana', 'DONE'],
      ]);
      expect(written[0].review).toBe('PASS - approved in PM Hub by ana');
      expect(written[0].verify).toBe(
        'approved in PM Hub by ana; no automated check ran',
      );
    });

    it('answers the handoff of the agent that made it', () => {
      const [review] = entries('STATUS_TERMINADA', handedOver);

      expect(review.summary).toBe('Review of the handoff from claude');
    });

    it('closes a task the ledger never saw handed over with the DONE alone', () => {
      expect(shape(entries('STATUS_TERMINADA', developing))).toEqual([
        ['ana', 'DONE'],
      ]);
    });

    it('closes a task whose handoff was answered by an agent with the DONE alone', () => {
      const passed = historyOf([
        ['claude', 'IN_PROGRESS', { verify: 'pending' }],
        ['claude', 'REVIEW', { verify: 'checked' }],
        ['codex', 'REVIEW', { verify: 'ran it', review: 'PASS - fine' }],
      ]);

      expect(shape(entries('STATUS_TERMINADA', passed))).toEqual([
        ['ana', 'DONE'],
      ]);
    });
  });

  describe('the return to development', () => {
    it('fails the review in the name of whoever sends it back, then lets the holder take it again with the reason', () => {
      const written = entries('STATUS_EN_DESARROLLO', handedOver, {
        note: 'the importer drops the last row',
      });

      expect(shape(written)).toEqual([
        ['ana', 'REVIEW'],
        ['claude', 'IN_PROGRESS'],
      ]);
      expect(written[0].review).toBe('FAIL - the importer drops the last row');
      expect(written[0].verify).toBeUndefined();
      expect(written[1].summary).toBe(
        'Back in development after review: Ship the importer (the importer drops the last row)',
      );
      expect(written[1].verify).toBe('pending');
    });

    it('says who sent it back when the person gave no reason', () => {
      const [review] = entries('STATUS_EN_DESARROLLO', handedOver);

      expect(review.review).toBe(
        'FAIL - returned to development in PM Hub by ana',
      );
    });

    it('is a withdrawn handoff, not a failed review, when the holder takes it back themselves', () => {
      const written = entries('STATUS_EN_DESARROLLO', handedOver, {
        requesterName: 'Claude',
      });

      expect(shape(written)).toEqual([['claude', 'IN_PROGRESS']]);
      expect(written[0].summary).toBe('Handoff withdrawn: Ship the importer');
    });

    it('takes the task again for the holder once an agent answered the handoff', () => {
      const failed = historyOf([
        ['claude', 'IN_PROGRESS', { verify: 'pending' }],
        ['claude', 'REVIEW', { verify: 'checked' }],
        ['codex', 'REVIEW', { review: 'FAIL - missing tests' }],
      ]);

      expect(shape(entries('STATUS_EN_DESARROLLO', failed))).toEqual([
        ['claude', 'IN_PROGRESS'],
      ]);
    });

    it('does not claim a task already in development a second time', () => {
      expect(entries('STATUS_EN_DESARROLLO', developing)).toEqual([]);
    });
  });

  describe('a project that did not opt in', () => {
    it('reads a REVIEW entry as no state, as it did before the switch', () => {
      expect(
        entries('STATUS_EN_DESARROLLO', handedOver, { qaHandoff: false }),
      ).toEqual([]);
      expect(
        shape(entries('STATUS_TERMINADA', handedOver, { qaHandoff: false })),
      ).toEqual([['ana', 'DONE']]);
    });
  });

  describe('a reassignment while a REVIEW is in the history', () => {
    it('pauses the agent that holds the task, whoever answered the review last', () => {
      const failed = historyOf([
        ['claude', 'IN_PROGRESS', { verify: 'pending' }],
        ['claude', 'REVIEW', { verify: 'checked' }],
        ['ana', 'REVIEW', { review: 'FAIL - missing tests' }],
      ]);

      const written = entries('LOCKED_REASSIGN', failed, {
        assigneeName: 'codex',
      });

      expect(shape(written)).toEqual([
        ['claude', 'PAUSE'],
        ['codex', 'IN_PROGRESS'],
      ]);
    });
  });

  describe('which Roadmaps may carry the review stage', () => {
    it('accepts the skill tables only', () => {
      expect(acceptsReviewEntries(SKILL_ROADMAP)).toBe(true);
      expect(acceptsReviewEntries('# Roadmap\n\nnothing here\n')).toBe(false);
    });
  });
});
