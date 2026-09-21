import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  afterPosition,
  decodeCursor,
  encodeCursor,
  pageOf,
} from './pagination.js';

const at = (iso: string, id: string) => ({ createdAt: new Date(iso), id });

describe('cursors (Roadmap IMPROVEMENT-01d3)', () => {
  it('gives back the position it was made from', () => {
    const position = at('2026-09-21T10:00:00.123Z', 'task-1');

    expect(decodeCursor(encodeCursor(position))).toEqual(position);
  });

  it('is a plain string a header can carry', () => {
    expect(encodeCursor(at('2026-09-21T10:00:00.000Z', 'a b/c'))).toMatch(
      /^[A-Za-z0-9_-]+$/,
    );
  });

  it.each([
    ['not base64 json', 'zzz'],
    ['json that is not a cursor', Buffer.from('{"x":1}').toString('base64url')],
    [
      'a cursor with no id',
      Buffer.from('{"t":"2026-09-21T10:00:00Z","i":""}').toString('base64url'),
    ],
    [
      'a cursor with a bad time',
      Buffer.from('{"t":"nope","i":"a"}').toString('base64url'),
    ],
    ['nothing', ''],
  ])('refuses %s with a 400', (_label, cursor) => {
    expect(() => decodeCursor(cursor)).toThrow(BadRequestException);
  });
});

describe('afterPosition', () => {
  it('picks up later times, and later ids at the same time', () => {
    const position = at('2026-09-21T10:00:00.000Z', 'task-5');

    expect(afterPosition(position)).toEqual({
      OR: [
        { createdAt: { gt: position.createdAt } },
        { createdAt: position.createdAt, id: { gt: 'task-5' } },
      ],
    });
  });
});

describe('pageOf', () => {
  const items = ['a', 'b', 'c', 'd', 'e'].map((id, index) =>
    at(`2026-09-21T10:00:0${index}.000Z`, id),
  );

  it('is the whole list, with no next page, when it fits', () => {
    expect(pageOf(items, 5)).toEqual({ page: items, nextCursor: null });
    expect(pageOf(items, 9)).toEqual({ page: items, nextCursor: null });
  });

  it('cuts at the limit and points at the last item it kept', () => {
    const { page, nextCursor } = pageOf(items, 2);

    expect(page.map((item) => item.id)).toEqual(['a', 'b']);
    expect(decodeCursor(nextCursor!)).toEqual(items[1]);
  });

  it('is empty, with no next page, for an empty list', () => {
    expect(pageOf([], 3)).toEqual({ page: [], nextCursor: null });
  });
});
