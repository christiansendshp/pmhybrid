import { BadRequestException } from '@nestjs/common';

/**
 * How a list is read a page at a time (Roadmap IMPROVEMENT-01d3). The body of a
 * list stays the array it always was, so no client has to change to keep
 * working; a page that is not the last says where the next starts in the
 * `X-Next-Cursor` response header. A cursor is opaque to a client: it names the
 * last item of the page by its position in the list's order.
 */

/** What a list returns when the client says nothing: enough for any real project, and a bound where there was none. */
export const DEFAULT_PAGE_SIZE = 500;
export const MAX_PAGE_SIZE = 500;

export const NEXT_CURSOR_HEADER = 'X-Next-Cursor';

/** Where a page ends, in a list ordered by creation time and then id. */
export interface PositionCursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor(position: PositionCursor): string {
  return Buffer.from(
    JSON.stringify({ t: position.createdAt.toISOString(), i: position.id }),
  ).toString('base64url');
}

/** Undoes `encodeCursor`; anything else a client sends is a 400, not a guess. */
export function decodeCursor(cursor: string): PositionCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf-8'),
    ) as { t?: unknown; i?: unknown };
    const createdAt =
      typeof parsed.t === 'string' ? new Date(parsed.t) : undefined;
    if (
      !createdAt ||
      Number.isNaN(createdAt.getTime()) ||
      typeof parsed.i !== 'string' ||
      parsed.i === ''
    ) {
      throw new Error('not a cursor');
    }
    return { createdAt, id: parsed.i };
  } catch {
    throw new BadRequestException('cursor is not one this list gave');
  }
}

/** The `where` that picks up after `position` in a list ordered by `createdAt` and then `id`, both ascending. */
export function afterPosition(position: PositionCursor) {
  return {
    OR: [
      { createdAt: { gt: position.createdAt } },
      { createdAt: position.createdAt, id: { gt: position.id } },
    ],
  };
}

/**
 * A page and where the next one starts. The list is read one item past the
 * limit, so there is a next page exactly when that extra item is there.
 */
export function pageOf<T extends PositionCursor>(
  items: T[],
  limit: number,
): { page: T[]; nextCursor: string | null } {
  if (items.length <= limit) {
    return { page: items, nextCursor: null };
  }
  const page = items.slice(0, limit);
  return { page, nextCursor: encodeCursor(page[page.length - 1]) };
}
