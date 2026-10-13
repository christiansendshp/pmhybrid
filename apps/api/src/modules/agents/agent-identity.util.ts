import { LIMITS } from '../../common/dto-limits.js';
import { normalizeOwnerName } from '../roadmap/roadmap-owner.util.js';

/** How many aliases one agent may carry. */
export const MAX_ALIASES = 20;

/**
 * What two spellings of one agent name have in common (Roadmap TASK-01): the
 * same folding the document's owner cell already gets — case, spacing and
 * Unicode composition do not matter, accents do — so a name resolves the same
 * way from the owner cell, from the ledger and from the agent's profile.
 */
export const identifierKey = normalizeOwnerName;

/** A token of this shape (a prefix a provider uses for its keys, or a long opaque run) is a credential, not a name. */
const KEY_PREFIX =
  /^(sk[-_]|pmh_|gh[pos]_|github_pat_|xox[abprs]-)[A-Za-z0-9_-]{8,}/i;
/** The fixed shapes of an AWS access key and a Google API key. */
const FIXED_SHAPE = /^((AKIA|ASIA)[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35})$/;
const OPAQUE_TOKEN = /^[A-Za-z0-9_\-+/=]{40,}$/;

export function looksLikeCredential(value: string): boolean {
  const text = value.trim();
  return (
    KEY_PREFIX.test(text) || FIXED_SHAPE.test(text) || OPAQUE_TOKEN.test(text)
  );
}

/**
 * Why a string cannot be an agent's name or alias, or null when it can. It
 * ends up between `|` in a ledger header, so it cannot hold one, nor a line
 * break or a control character; and it is plain text in the database
 * (BR-008), so it cannot look like a credential.
 */
export function identifierProblem(value: string): string | null {
  const text = value.trim();
  if (text.length === 0) {
    return 'is empty';
  }
  if (text.length > LIMITS.ID) {
    return `is longer than ${LIMITS.ID} characters`;
  }
  // eslint-disable-next-line no-control-regex
  if (/[|\u0000-\u001f\u007f]/.test(text)) {
    return 'holds a "|", a line break or a control character';
  }
  if (looksLikeCredential(text)) {
    return 'looks like a credential: names are stored as plain text, keep secrets in environment variables';
  }
  return null;
}
