/** Who a Roadmap entry names as its assignee, in the terms PM Hub's actors use (Roadmap GAP-35a). */
export type RoadmapOwnerKind = 'HUMAN' | 'AI_AGENT';

export interface RoadmapOwner {
  name: string;
  kind: RoadmapOwnerKind;
}

/**
 * The Owner cell of the old tables (docs/roadmap-parser.md): an AI agent is
 * `Name@claimed-at`, a person is the bare name, nobody is the placeholder.
 */
export function ownerCell(
  owner: RoadmapOwner | null,
  claimedAtIso: string,
): string {
  if (!owner) {
    return '—';
  }
  return owner.kind === 'AI_AGENT'
    ? `${owner.name}@${claimedAtIso}`
    : owner.name;
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?$/;

/** The name a stored raw owner (`Name`, or `Name@timestamp` for an agent) carries, without the claim time. */
export function ownerNameFromRaw(
  rawOwner: string | null | undefined,
): string | undefined {
  const trimmed = rawOwner?.trim();
  if (!trimmed) {
    return undefined;
  }
  const at = trimmed.lastIndexOf('@');
  const tail = at > 0 ? trimmed.slice(at + 1) : '';
  // Only an ISO timestamp is a claim time; `Date` alone would read "10" or
  // "example.com" from a name like `team@10` as one.
  if (ISO_TIMESTAMP.test(tail) && !Number.isNaN(new Date(tail).getTime())) {
    return trimmed.slice(0, at).trim() || undefined;
  }
  return trimmed;
}

/**
 * Two spellings of one name compare equal: case, surrounding and repeated
 * whitespace and Unicode composition do not matter; accents do (folding
 * them would join people whose names differ only by one).
 */
export function normalizeOwnerName(name: string): string {
  return name.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

export interface OwnerCandidate {
  actorId: string;
  displayName: string;
  kind: RoadmapOwnerKind;
}

export type OwnerResolution =
  | { status: 'MATCHED'; actorId: string }
  | { status: 'NONE' }
  | { status: 'AMBIGUOUS' };

/**
 * Resolves the name a document gives as owner to one of the candidates
 * (the active members of the project). A kind narrows the search — an entry
 * that says `executor: AI` names an agent, `owner.type: HUMAN` a person; with
 * no kind (the old tables) both are searched.
 *
 * Exactly one match is a match. None, and more than one, are not: picking
 * one of several would put the task on a person the document may not mean —
 * the same defect as a duplicate id silently keeping the last — so the caller
 * leaves the assignee alone and the raw owner stands.
 */
export function resolveOwner(
  candidates: readonly OwnerCandidate[],
  name: string,
  kind?: RoadmapOwnerKind,
): OwnerResolution {
  const wanted = normalizeOwnerName(name);
  if (!wanted) {
    return { status: 'NONE' };
  }
  const matches = candidates.filter(
    (candidate) =>
      (!kind || candidate.kind === kind) &&
      normalizeOwnerName(candidate.displayName) === wanted,
  );
  if (matches.length === 1) {
    return { status: 'MATCHED', actorId: matches[0].actorId };
  }
  return { status: matches.length === 0 ? 'NONE' : 'AMBIGUOUS' };
}
