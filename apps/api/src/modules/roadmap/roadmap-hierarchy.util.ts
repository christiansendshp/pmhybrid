/**
 * Where a Roadmap entry sits (Roadmap GAP-35d). The YAML format carries the
 * spine as `parent` links (`references/roadmap-schema.md` §3), which PM Hub
 * keeps as three things: the task an entry is a subtask of, the epic it
 * belongs to, and the phase. This module only decides, from the document, which
 * of the three each entry states; storing them is the sync's job.
 */

export interface HierarchyEntry {
  externalId: string;
  entryType?: string;
  /** The entry's parent as it names it (`ParsedRoadmapRow.parentRef`). */
  parentRef?: string;
}

/** What an entry's parent chain says of it, as ids of Roadmap entries. */
export interface Placement {
  /** The task this entry is a subtask of: its parent when that is work. */
  parentTask: string | null;
  epic: string | null;
  phase: string | null;
}

/** Entry types PM Hub keeps as a Phase or an Epic instead of a task. */
export const STRUCTURAL_ENTRY_TYPES: readonly string[] = ['PHASE', 'EPIC'];

export function isStructuralEntry(entry: { entryType?: string }): boolean {
  return (
    entry.entryType !== undefined &&
    STRUCTURAL_ENTRY_TYPES.includes(entry.entryType)
  );
}

/** Levels PM Hub has no record for; their children take the placement of the level above. */
const PASS_THROUGH_TYPES: readonly string[] = ['THEME', 'VISION'];

/**
 * The placement of every entry whose parent chain the document states. An
 * entry with no parent, whose parent is not in the document (a finished entry
 * is taken out of the file), or whose chain loops is left out: the document
 * says nothing usable about it, so nothing is changed.
 */
export function resolvePlacements(
  entries: readonly HierarchyEntry[],
): Map<string, Placement> {
  const byId = new Map(entries.map((entry) => [entry.externalId, entry]));

  /** Whether following parents from `entry` comes back to it. */
  const loops = (entry: HierarchyEntry): boolean => {
    const seen = new Set<string>();
    let current = entry.parentRef ? byId.get(entry.parentRef) : undefined;
    while (current && !seen.has(current.externalId)) {
      if (current.externalId === entry.externalId) {
        return true;
      }
      seen.add(current.externalId);
      current = current.parentRef ? byId.get(current.parentRef) : undefined;
    }
    return false;
  };

  const placementOf = (entry: HierarchyEntry): Placement | undefined => {
    const parent = entry.parentRef ? byId.get(entry.parentRef) : undefined;
    if (!parent || loops(entry)) {
      return undefined;
    }
    const type = parent.entryType ?? '';
    if (type === 'PHASE') {
      return { parentTask: null, epic: null, phase: parent.externalId };
    }
    if (type === 'EPIC') {
      return {
        parentTask: null,
        epic: parent.externalId,
        phase: placementOf(parent)?.phase ?? null,
      };
    }
    if (PASS_THROUGH_TYPES.includes(type)) {
      return placementOf(parent);
    }
    // Work: the entry is one of its subtasks, and sits where the parent sits.
    return { parentTask: parent.externalId, epic: null, phase: null };
  };

  const placements = new Map<string, Placement>();
  for (const entry of entries) {
    const placement = placementOf(entry);
    if (placement) {
      placements.set(entry.externalId, placement);
    }
  }
  return placements;
}

/** Whether `taskId` is `start` or one of its ancestors. */
export function reachesTask(
  parentOf: ReadonlyMap<string, string | null>,
  start: string,
  taskId: string,
): boolean {
  const seen = new Set<string>();
  let current: string | null | undefined = start;
  while (current && !seen.has(current)) {
    if (current === taskId) {
      return true;
    }
    seen.add(current);
    current = parentOf.get(current);
  }
  return false;
}
