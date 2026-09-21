import type { ParsedAgentLogEntry } from './agentslog-parser.service.js';
import type { AgentslogEntryInput } from './agentslog-writer.util.js';

export type SkillLedgerTrigger =
  'CREATED' | 'STATUS_EN_DESARROLLO' | 'STATUS_TERMINADA' | 'LOCKED_REASSIGN';

const SKILL_STATES = new Set(['IN_PROGRESS', 'PAUSE', 'DONE']);

/**
 * The ledger entries a PM Hub lifecycle event becomes in a project documented
 * with the latest skill (Roadmap GAP-37b). Its `check` accepts only the states
 * IN_PROGRESS / PAUSE / DONE, wants a real Verify on DONE, refuses two agents
 * holding one task, and refuses a ledger ID that is in neither Roadmap.md nor
 * Features.md. So:
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
}): AgentslogEntryInput[] {
  const { trigger, timestampIso, taskExternalId, title } = input;
  const last = input.history
    .filter((entry) => SKILL_STATES.has(entry.statusWord))
    .at(-1);
  const held = last?.statusWord === 'IN_PROGRESS';
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

  switch (trigger) {
    case 'CREATED':
      return [];
    case 'STATUS_EN_DESARROLLO':
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
    case 'STATUS_TERMINADA':
      return [
        entry(input.requesterName, 'DONE', `Completed: ${title}`, {
          verify: `marked done in PM Hub by ${input.requesterName}; no automated check ran`,
        }),
      ];
    case 'LOCKED_REASSIGN': {
      const next = input.assigneeName;
      if (!next || (held && last.agentName === next)) {
        return [];
      }
      const entries: AgentslogEntryInput[] = [];
      if (held) {
        entries.push(
          entry(last.agentName, 'PAUSE', `Reassigned in PM Hub: ${title}`, {
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
