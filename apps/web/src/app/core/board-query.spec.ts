import { describe, expect, it } from 'vitest';
import { NO_FILTERS, UNASSIGNED } from './board.js';
import {
  BoardMemory,
  BoardView,
  DEFAULT_VIEW,
  hasBoardParams,
  paramsToView,
  viewToParams,
} from './board-query.js';

const fromRecord = (record: Record<string, string>) => (key: string) => record[key] ?? null;

describe('the board view in a query string (Roadmap UX-02b)', () => {
  it('has no query for an untouched board', () => {
    expect(viewToParams(DEFAULT_VIEW)).toEqual({});
    expect(hasBoardParams(viewToParams(DEFAULT_VIEW))).toBe(false);
  });

  it('says only what differs from the default', () => {
    expect(
      viewToParams({
        filters: { ...NO_FILTERS, search: 'sync', priority: 'HIGH', blockedOnly: true },
        groupBy: 'epic',
        sortBy: 'dueDate',
      }),
    ).toEqual({ q: 'sync', priority: 'HIGH', blocked: '1', group: 'epic', sort: 'dueDate' });
  });

  it('carries the people, the phase and the epic by id, and the unassigned marker', () => {
    expect(
      viewToParams({
        filters: { ...NO_FILTERS, assigneeId: UNASSIGNED, phaseId: 'ph1', epicId: 'ep1' },
        groupBy: 'none',
        sortBy: 'created',
      }),
    ).toEqual({ assignee: UNASSIGNED, phase: 'ph1', epic: 'ep1' });
  });

  it('gives back the view it was made from', () => {
    const view: BoardView = {
      filters: {
        search: 'a b',
        assigneeId: 'actor-1',
        priority: 'CRITICAL',
        phaseId: 'ph1',
        epicId: 'ep1',
        blockedOnly: true,
      },
      groupBy: 'assignee',
      sortBy: 'progress',
    };

    const params = viewToParams(view);

    expect(paramsToView(fromRecord(params as Record<string, string>))).toEqual(view);
  });

  it('reads an empty query as the default view', () => {
    expect(paramsToView(fromRecord({}))).toEqual(DEFAULT_VIEW);
  });

  it('leaves at its default a value the board does not know, instead of failing on a hand-edited address', () => {
    const view = paramsToView(
      fromRecord({ priority: 'URGENT', group: 'colour', sort: 'mood', blocked: 'yes', q: 'x' }),
    );

    expect(view.filters.priority).toBeNull();
    expect(view.filters.blockedOnly).toBe(false);
    expect(view.groupBy).toBe('none');
    expect(view.sortBy).toBe('created');
    // What it can use, it keeps.
    expect(view.filters.search).toBe('x');
  });
});

describe('BoardMemory', () => {
  it('gives back, for a project, the query its board was left with', () => {
    const memory = new BoardMemory();

    memory.remember('p1', { q: 'sync' });
    memory.remember('p2', { blocked: '1' });

    expect(memory.recall('p1')).toEqual({ q: 'sync' });
    expect(memory.recall('p2')).toEqual({ blocked: '1' });
  });

  it('forgets it when the board is left unfiltered, and knows nothing of a project it has not seen', () => {
    const memory = new BoardMemory();
    memory.remember('p1', { q: 'sync' });

    memory.remember('p1', {});

    expect(memory.recall('p1')).toEqual({});
    expect(memory.recall('never')).toEqual({});
  });
});
