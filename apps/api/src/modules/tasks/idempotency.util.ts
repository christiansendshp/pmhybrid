import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';

/** How long a key remembers its task: long enough for any client retry policy, short enough that the table stays small (Roadmap BUG-07b). */
export const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Printable ASCII with no spaces, 1-128 characters: a UUID, a ULID or any opaque token a client mints. */
const KEY_FORMAT = /^[\x21-\x7e]{1,128}$/;

/**
 * The `Idempotency-Key` header of a creation request, or undefined when the
 * client sent none (the request then behaves exactly as it always did). A key
 * that is empty, too long or has a space in it is refused rather than
 * silently ignored: a client that thinks it is retry-safe and is not is worse
 * off than one told so.
 */
export function parseIdempotencyKey(
  raw: string | string[] | undefined,
): string | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const value = Array.isArray(raw) ? '' : raw.trim();
  if (!KEY_FORMAT.test(value)) {
    throw new BadRequestException(
      'Idempotency-Key must be 1 to 128 printable characters with no spaces',
    );
  }
  return value;
}

/**
 * A stable fingerprint of what a creation request asked for, so a key reused
 * for a different request is caught instead of answered with the wrong task.
 * Key order and undefined fields do not matter.
 */
export function requestFingerprint(request: object): string {
  const canonical = Object.fromEntries(
    Object.entries(request)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
