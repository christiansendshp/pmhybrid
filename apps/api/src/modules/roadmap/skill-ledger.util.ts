import type { ParsedAgentLogEntry } from './agentslog-parser.service.js';
import type { AgentslogEntryInput } from './agentslog-writer.util.js';
import { isSkillRoadmap } from './markdown-table.util.js';
import { looksLikeNewFormatRoadmap } from './roadmap-yaml-entry.util.js';

export type SkillLedgerTrigger =
  | 'CREATED'
  | 'STATUS_EN_DESARROLLO'
  // A move to QA (Roadmap TASK-08): the developer's handoff, in a project that writes it.
  | 'STATUS_QA'
  | 'STATUS_TERMINADA'
  | 'LOCKED_REASSIGN'
  | 'RESTORED';

const SKILL_STATES = new Set(['IN_PROGRESS', 'PAUSE', 'DONE']);
/** What a project that writes the QA handoff counts as a state of the task: the review stage is one (Roadmap TASK-08). */
const SKILL_STATES_WITH_REVIEW = new Set([...SKILL_STATES, 'REVIEW']);

/**
 * Whether the Roadmap is in a format of the project-documentation skill, whose ledger knows
 * three states (Roadmap GAP-37b, TASK-04): the table with a `Pause reason` column, or the
 * entries with a YAML block under `## Plan` and `## Cross-cutting`, which is what the
 * skill's own `init` writes today. Every other document keeps the older entries.
 */
export function usesSkillLedger(roadmapMarkdown: string): boolean {
  return (
    isSkillRoadmap(roadmapMarkdown) ||
    looksLikeNewFormatRoadmap(roadmapMarkdown)
  );
}

/** The skill matches an agent's name without regard to case. */
function sameAgent(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Whether the ledger of this Roadmap may carry the review stage (a `REVIEW`
 * entry with its `Handoff:` and `Review:` bullets): only the skill's tables, whose
 * `check` accepts it (Roadmap TASK-08). The YAML entries keep three states.
 */
export function acceptsReviewEntries(roadmapMarkdown: string): boolean {
  return isSkillRoadmap(roadmapMarkdown);
}

/**
 * The ledger entries a PM Hub lifecycle event becomes in a project documented
 * with the latest skill (Roadmap GAP-37b). Its `check` accepts only the states
 * IN_PROGRESS / PAUSE / DONE (and REVIEW / ASSIGNED, which a project opts in to),
 * wants a real Verify on DONE, refuses two agents holding one task, and refuses
 * a ledger ID that is in neither Roadmap.md nor Features.md. So:
 *
 * - created writes nothing (there is no such state, and the row carries it);
 * - started writes IN_PROGRESS with Verify "pending", unless the task is
 *   already held (a second claim is the error `check` names);
 * - completed writes DONE, with a Verify that says what it is: marked done in
 *   PM Hub, no check ran;
 * - a held task handed to someone else writes PAUSE for the previous holder
 *   (category OTRO, the skill's catch-all) and IN_PROGRESS for the new one,
 *   the same two steps the skill asks of two agents.
 *
 * With `qaHandoff` (the project's switch, Roadmap TASK-08) the review stage is
 * written too, as the skill does it:
 *
 * - a move to QA is a REVIEW entry in the holder's name (`Handoff:` the reviewer
 *   when there is one), after an IN_PROGRESS entry if the task was not held;
 * - approving it is a REVIEW entry that passes, then the DONE the reviewer who
 *   passed it may write;
 * - sending it back is a REVIEW entry that fails (when someone other than the
 *   holder sends it), then the holder's IN_PROGRESS with the reason; the
 *   holder taking it back themselves is the IN_PROGRESS alone (a withdrawn handoff).
 *
 * Whatever the ledger shows decides the pair: an approval or a return with no
 * handoff pending in the ledger writes what it wrote before the switch.
 *
 * `history` is the hot ledger's entries for this task, oldest first.
 */
export function skillLedgerEntries(input: {
  trigger: SkillLedgerTrigger;
  timestampIso: string;
  taskExternalId: string;
  title: string;
  requesterName: string;
  /** Who the task is assigned to, or null. */
  assigneeName: string | null;
  history: ParsedAgentLogEntry[];
  /** The project writes the QA handoff into this ledger and it accepts the review stage (Roadmap TASK-08). */
  qaHandoff?: boolean;
  /** Who was asked to review the task with the move to QA, or null (Roadmap SUBTASK-09.1). */
  reviewerName?: string | null;
  /** What the person said with a move to QA or a return from it. */
  note?: string;
}): AgentslogEntryInput[] {
  const { trigger, timestampIso, taskExternalId, title } = input;
  const qaHandoff = input.qaHandoff ?? false;
  const states = qaHandoff ? SKILL_STATES_WITH_REVIEW : SKILL_STATES;
  const last = input.history
    .filter((entry) => states.has(entry.statusWord))
    .at(-1);
  const inReview = last?.statusWord === 'REVIEW';
  const reviewed = inReview && last.review !== undefined;
  // A handoff nobody has answered yet: the task is waiting for its reviewer.
  const pendingHandoff = inReview && !reviewed;
  const held = last?.statusWord === 'IN_PROGRESS' || inReview;
  // Who holds it is who last took it, whatever came after: a review is not the holder's.
  const holder = held
    ? input.history.filter((entry) => entry.statusWord === 'IN_PROGRESS').at(-1)
        ?.agentName
    : undefined;
  const entry = (
    agentName: string,
    statusWord: string,
    summary: string,
    rest: Partial<AgentslogEntryInput>,
  ): AgentslogEntryInput => ({
    timestampIso,
    agentName,
    taskExternalId,
    statusWord,
    summary,
    ...rest,
  });
  /** Who takes the task up when the ledger does not say: whoever it is assigned to, or whoever acts. */
  const developer = holder ?? input.assigneeName ?? input.requesterName;
  const withNote = (text: string) =>
    input.note ? `${text} - ${input.note}` : text;

  switch (trigger) {
    case 'CREATED':
    // A row written back for a task that already has its history: nothing new to say.
    case 'RESTORED':
      return [];
    case 'STATUS_EN_DESARROLLO': {
      if (qaHandoff && inReview) {
        // Back from QA: the holder takes it again. If someone else sends it back, that is the
        // review that fails, in their name, before the holder's claim.
        if (pendingHandoff && !sameAgent(input.requesterName, developer)) {
          const reason =
            input.note ??
            `returned to development in PM Hub by ${input.requesterName}`;
          return [
            entry(
              input.requesterName,
              'REVIEW',
              `Review of the handoff from ${developer}`,
              { review: `FAIL - ${reason}` },
            ),
            entry(
              developer,
              'IN_PROGRESS',
              `Back in development after review: ${title} (${reason})`,
              { verify: 'pending' },
            ),
          ];
        }
        return [
          entry(
            developer,
            'IN_PROGRESS',
            pendingHandoff
              ? withNote(`Handoff withdrawn: ${title}`)
              : `Back in development: ${title}`,
            { verify: 'pending' },
          ),
        ];
      }
      return held
        ? []
        : [
            entry(
              input.assigneeName ?? input.requesterName,
              'IN_PROGRESS',
              `Started: ${title}`,
              { verify: 'pending' },
            ),
          ];
    }
    case 'STATUS_QA': {
      // Nothing to hand over without the switch, or twice: the reviewer has the first one.
      if (!qaHandoff || pendingHandoff) {
        return [];
      }
      return [
        // Handing over is something a holder does, so a task nobody holds is taken first.
        ...(held && !reviewed
          ? []
          : [
              entry(developer, 'IN_PROGRESS', `Started: ${title}`, {
                verify: 'pending',
              }),
            ]),
        entry(developer, 'REVIEW', withNote(`Handed to review: ${title}`), {
          verify: `moved to QA in PM Hub by ${input.requesterName}; no automated check ran`,
          ...(input.reviewerName ? { handoff: input.reviewerName } : {}),
        }),
      ];
    }
    case 'STATUS_TERMINADA': {
      const done = entry(input.requesterName, 'DONE', `Completed: ${title}`, {
        verify: `marked done in PM Hub by ${input.requesterName}; no automated check ran`,
      });
      // The reviewer who passes a handoff may close the task: the pass comes first, in their name.
      return qaHandoff && pendingHandoff
        ? [
            entry(
              input.requesterName,
              'REVIEW',
              `Review of the handoff from ${developer}`,
              {
                verify: `approved in PM Hub by ${input.requesterName}; no automated check ran`,
                review: `PASS - approved in PM Hub by ${input.requesterName}`,
              },
            ),
            done,
          ]
        : [done];
    }
    case 'LOCKED_REASSIGN': {
      const next = input.assigneeName;
      if (!next || (held && holder === next)) {
        return [];
      }
      const entries: AgentslogEntryInput[] = [];
      if (held) {
        entries.push(
          entry(developer, 'PAUSE', `Reassigned in PM Hub: ${title}`, {
            pause: `OTRO - reassigned in PM Hub to ${next}`,
          }),
        );
      }
      entries.push(
        entry(next, 'IN_PROGRESS', `Took over: ${title}`, {
          verify: 'pending',
        }),
      );
      return entries;
    }
  }
}
