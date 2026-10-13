import { describe, expect, it } from 'vitest';
import { NO_FILTERS, UNASSIGNED, filterCards, groupCards, isBlocked, sortCards } from './board.js';
import { ProjectHierarchy } from './hierarchy.service.js';
import { TaskCard } from './tasks.service.js';

let sequence = 0;
function card(overrides: Partial<TaskCard> = {}): TaskCard {
  sequence += 1;
  return {
    id: `t${sequence}`,
    projectId: 'p1',
    externalId: `PMH-${sequence}`,
    title: `Task ${sequence}`,
    description: null,
    status: 'PENDIENTE',
    phaseId: null,
    epicId: null,
    templateId: null,
    parentTaskId: null,
    assigneeActorId: null,
    priority: null,
    entryType: null,
    progressPercent: null,
    acceptanceCriteria: 'Done',
    startDate: null,
    estimatedDate: null,
    dueDate: null,
    completedAt: null,
    statusChangedAt: '2026-10-01T10:00:00.000Z',
    instantClose: false,
    ledgerStage: null,
    ledgerNote: null,
    reviewerActorId: null,
    reviewRequestedAt: null,
    roadmapTable: 'ACTIVE',
    blockedReason: null,
    createdAt: `2026-09-${String(sequence).padStart(2, '0')}T09:00:00.000Z`,
    updatedAt: `2026-09-${String(sequence).padStart(2, '0')}T09:00:00.000Z`,
    assignee: null,
    reviewer: null,
    computedProgress: 0,
    subtaskCounts: { total: 0, done: 0 },
    dependencyCounts: { total: 0, open: 0 },
    ...overrides,
  };
}

const HIERARCHY: ProjectHierarchy = {
  phases: [
    { id: 'late', projectId: 'p1', name: 'Launch', order: 2, description: null, status: null },
    { id: 'early', projectId: 'p1', name: 'Build', order: 1, description: null, status: null },
  ],
  epics: [],
  templates: [],
};

const ana = { id: 'ana', displayName: 'Ana García', kind: 'HUMAN' as const };
const codex = { id: 'codex', displayName: 'Codex', kind: 'AI_AGENT' as const };

describe('board (brief §15)', () => {
  it('flags a card blocked in the Roadmap or waiting on unfinished dependencies', () => {
    expect(isBlocked(card({ roadmapTable: 'BLOCKED' }))).toBe(true);
    expect(isBlocked(card({ dependencyCounts: { total: 2, open: 1 } }))).toBe(true);
    expect(isBlocked(card({ dependencyCounts: { total: 2, open: 0 } }))).toBe(false);
  });

  it('searches by title or Roadmap ID and combines every filter', () => {
    const api = card({
      title: 'Build API',
      externalId: 'PMH-100',
      assigneeActorId: 'ana',
      assignee: ana,
      priority: 'HIGH',
    });
    const docs = card({ title: 'Write docs', externalId: 'DOC-7', phaseId: 'early' });
    const blocked = card({
      title: 'Deploy',
      roadmapTable: 'BLOCKED',
      assigneeActorId: 'codex',
      assignee: codex,
    });
    const cards = [api, docs, blocked];

    expect(filterCards(cards, { ...NO_FILTERS, search: 'api' })).toEqual([api]);
    expect(filterCards(cards, { ...NO_FILTERS, search: 'doc-7' })).toEqual([docs]);
    expect(filterCards(cards, { ...NO_FILTERS, assigneeId: 'ana' })).toEqual([api]);
    expect(filterCards(cards, { ...NO_FILTERS, assigneeId: UNASSIGNED })).toEqual([docs]);
    expect(filterCards(cards, { ...NO_FILTERS, priority: 'HIGH' })).toEqual([api]);
    expect(filterCards(cards, { ...NO_FILTERS, phaseId: 'early' })).toEqual([docs]);
    expect(filterCards(cards, { ...NO_FILTERS, blockedOnly: true })).toEqual([blocked]);
    expect(filterCards(cards, { ...NO_FILTERS, search: 'api', priority: 'LOW' })).toEqual([]);
  });

  describe('the filters of Roadmap TASK-16', () => {
    const NOW = new Date('2026-10-14T12:00:00Z');
    const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
    const ids = (cards: TaskCard[]) => cards.map((c) => c.externalId);

    it('keeps the unfinished tasks that have not moved for longer than the hours asked, and not the finished', () => {
      const old = card({
        externalId: 'OLD',
        status: 'EN_DESARROLLO',
        statusChangedAt: hoursAgo(80),
      });
      const recent = card({ externalId: 'NEW', status: 'QA', statusChangedAt: hoursAgo(2) });
      const done = card({
        externalId: 'DONE',
        status: 'TERMINADA',
        statusChangedAt: hoursAgo(900),
      });

      expect(ids(filterCards([old, recent, done], { ...NO_FILTERS, staleHours: 72 }, NOW))).toEqual(
        ['OLD'],
      );
      expect(ids(filterCards([old, recent, done], { ...NO_FILTERS, staleHours: 1 }, NOW))).toEqual([
        'OLD',
        'NEW',
      ]);
      expect(ids(filterCards([old, recent, done], NO_FILTERS, NOW))).toEqual([
        'OLD',
        'NEW',
        'DONE',
      ]);
    });

    it('is exact at the limit: a task that moved exactly that long ago is not yet stale', () => {
      const edge = card({ externalId: 'EDGE', statusChangedAt: hoursAgo(24) });

      expect(ids(filterCards([edge], { ...NO_FILTERS, staleHours: 24 }, NOW))).toEqual([]);
      expect(ids(filterCards([edge], { ...NO_FILTERS, staleHours: 23 }, NOW))).toEqual(['EDGE']);
    });

    it('keeps the tasks whose assignee is a person or an agent, and none of the unassigned', () => {
      const person = card({
        externalId: 'H',
        assignee: { id: 'a', displayName: 'Ana', kind: 'HUMAN' },
      });
      const agent = card({
        externalId: 'A',
        assignee: { id: 'b', displayName: 'Codex', kind: 'AI_AGENT' },
      });
      const nobody = card({ externalId: 'N', assignee: null });

      expect(
        ids(filterCards([person, agent, nobody], { ...NO_FILTERS, assigneeKind: 'AI_AGENT' })),
      ).toEqual(['A']);
      expect(
        ids(filterCards([person, agent, nobody], { ...NO_FILTERS, assigneeKind: 'HUMAN' })),
      ).toEqual(['H']);
    });

    it('keeps the tasks a reviewer was asked about', () => {
      const asked = card({
        externalId: 'R',
        reviewer: { id: 'ana', displayName: 'Ana', kind: 'HUMAN' },
      });
      const other = card({
        externalId: 'O',
        reviewer: { id: 'bo', displayName: 'Bo', kind: 'HUMAN' },
      });
      const none = card({ externalId: 'X', reviewer: null });

      expect(ids(filterCards([asked, other, none], { ...NO_FILTERS, reviewerId: 'ana' }))).toEqual([
        'R',
      ]);
    });

    it('keeps the tasks whose ledger and board disagree, with a start in the ledger agreeing with QA', () => {
      const apart = card({ externalId: 'D', status: 'EN_DESARROLLO', ledgerStage: 'QA' });
      const same = card({ externalId: 'S', status: 'QA', ledgerStage: 'QA' });
      const coarse = card({ externalId: 'C', status: 'QA', ledgerStage: 'EN_DESARROLLO' });
      const silent = card({ externalId: 'Z', status: 'QA', ledgerStage: null });

      expect(
        ids(filterCards([apart, same, coarse, silent], { ...NO_FILTERS, divergentOnly: true })),
      ).toEqual(['D']);
    });

    it('keeps the tasks closed within minutes of starting', () => {
      const instant = card({ externalId: 'I', instantClose: true });
      const slow = card({ externalId: 'L', instantClose: false });

      expect(ids(filterCards([instant, slow], { ...NO_FILTERS, instantCloseOnly: true }))).toEqual([
        'I',
      ]);
    });

    it('combines with the older filters', () => {
      const match = card({
        externalId: 'M',
        priority: 'HIGH',
        status: 'EN_DESARROLLO',
        statusChangedAt: hoursAgo(100),
        assignee: { id: 'b', displayName: 'Codex', kind: 'AI_AGENT' },
      });
      const wrongPriority = { ...match, externalId: 'P', priority: 'LOW' as const };
      const tooRecent = { ...match, externalId: 'T', statusChangedAt: hoursAgo(1) };

      expect(
        ids(
          filterCards(
            [match, wrongPriority, tooRecent],
            { ...NO_FILTERS, priority: 'HIGH', staleHours: 24, assigneeKind: 'AI_AGENT' },
            NOW,
          ),
        ),
      ).toEqual(['M']);
    });
  });

  it('sorts by priority, due date and Roadmap ID with missing values last', () => {
    const low = card({
      priority: 'LOW',
      dueDate: '2026-10-20T00:00:00.000Z',
      externalId: 'PMH-10',
    });
    const none = card({ priority: null, dueDate: null, externalId: null });
    const critical = card({
      priority: 'CRITICAL',
      dueDate: '2026-10-01T00:00:00.000Z',
      externalId: 'PMH-2',
    });
    const cards = [low, none, critical];

    expect(sortCards(cards, 'priority')).toEqual([critical, low, none]);
    expect(sortCards(cards, 'dueDate')).toEqual([critical, low, none]);
    expect(sortCards(cards, 'externalId')).toEqual([critical, low, none]);
    expect(cards).toEqual([low, none, critical]);
  });

  it('sorts by lowest progress first and by most recently updated', () => {
    const halfway = card({ computedProgress: 50, updatedAt: '2026-09-20T09:00:00.000Z' });
    const starting = card({ computedProgress: 10, updatedAt: '2026-09-10T09:00:00.000Z' });

    expect(sortCards([halfway, starting], 'progress')).toEqual([starting, halfway]);
    expect(sortCards([starting, halfway], 'updated')).toEqual([halfway, starting]);
  });

  it('groups into lanes in a meaningful order, keeps column order, and puts the "none" lane last', () => {
    const inLaunch = card({ phaseId: 'late', status: 'QA' });
    const loose = card({ phaseId: null });
    const inBuildFirst = card({ phaseId: 'early', status: 'EN_DESARROLLO' });
    const inBuildSecond = card({ phaseId: 'early', status: 'EN_DESARROLLO' });

    const lanes = groupCards([inLaunch, loose, inBuildFirst, inBuildSecond], 'phase', HIERARCHY);

    expect(lanes.map((lane) => [lane.label, lane.count])).toEqual([
      ['Build', 2],
      ['Launch', 1],
      ['Sin fase', 1],
    ]);
    expect(lanes[0].columns.EN_DESARROLLO).toEqual([inBuildFirst, inBuildSecond]);
    expect(lanes[1].columns.QA).toEqual([inLaunch]);
  });

  it('orders assignee lanes by name and priority lanes by rank', () => {
    const byCodex = card({ assignee: codex, assigneeActorId: 'codex', priority: 'LOW' });
    const byAna = card({ assignee: ana, assigneeActorId: 'ana', priority: 'CRITICAL' });
    const nobody = card();

    expect(
      groupCards([byCodex, nobody, byAna], 'assignee', HIERARCHY).map((lane) => lane.label),
    ).toEqual(['Ana García', 'Codex', 'Sin asignar']);
    expect(
      groupCards([byCodex, nobody, byAna], 'priority', HIERARCHY).map((lane) => lane.label),
    ).toEqual(['CRITICAL', 'LOW', 'Sin prioridad']);
    expect(groupCards([byCodex, byAna], 'none', HIERARCHY)).toHaveLength(1);
  });
});
