import { AGENT_ROSTER_COLUMNS } from '@pmhybrid/shared-types';
import type { Actor } from './actors.service.js';

/** The columns of the skill's roster (`## Agent identity` of its AGENTS.md template), in its order. */
export const ROSTER_HEADER = `| ${AGENT_ROSTER_COLUMNS.join(' | ')} |`;
const ROSTER_RULE = `|${AGENT_ROSTER_COLUMNS.map(() => '---').join('|')}|`;
const NONE = '—';

/** The agents the table holds and what was left out of it, so the page can say it. */
export interface AgentRoster {
  /** The table in Markdown, header included; empty when no agent made it. */
  table: string;
  rows: number;
  /** One line for each agent or alias that was left out, and why. */
  left: string[];
}

/** Whether a text would split a row or the table: it holds a `|`, a line break or another control character. */
function breaksARow(text: string): boolean {
  return [...text].some((char) => {
    const code = char.charCodeAt(0);
    return char === '|' || code < 32 || code === 127;
  });
}

/** The text a cell can hold, or null when there is none or it would break the table. */
function cellOf(value: string): string | null {
  const text = value.trim();
  return text === '' || breaksARow(text) ? null : text;
}

/**
 * The skill's roster for the active AI agents (Roadmap TASK-25): one row each, with the ledger name as the
 * Agent id (the string the agent passes to the skill), `AI` as the kind, the model, the role the agent plays
 * in a task's life and its aliases, comma separated. The app writes nothing to the project's files: a person
 * pastes this into the project's AGENTS.md.
 *
 * A name that would break the table never reaches it: an agent whose id holds a `|` or a line break is left out
 * of it, and an alias or a model that does is left out of its row, each said in `left`. An alias with a comma
 * would be read as two, so it is left out as well.
 */
export function agentRoster(actors: readonly Actor[]): AgentRoster {
  const left: string[] = [];
  const rows: string[] = [];
  for (const actor of actors) {
    const profile = actor.agentProfile;
    if (actor.kind !== 'AI_AGENT' || !actor.isActive || !profile) {
      continue;
    }
    const id = cellOf(profile.ledgerName ?? actor.displayName);
    if (id === null) {
      left.push(`${actor.displayName}: su nombre en el registro no cabe en una tabla.`);
      continue;
    }
    const aliases: string[] = [];
    for (const alias of profile.aliases ?? []) {
      const cell = cellOf(alias);
      if (cell === null || cell.includes(',')) {
        left.push(`${id}: el alias «${alias.replace(/\s+/g, ' ')}» no cabe en una tabla.`);
      } else {
        aliases.push(cell);
      }
    }
    const model = profile.model ? cellOf(profile.model) : null;
    if (profile.model && model === null) {
      left.push(`${id}: el modelo no cabe en una tabla.`);
    }
    rows.push(
      `| ${id} | AI | ${model ?? NONE} | ${profile.stageRole ?? 'BOTH'} | ${aliases.length > 0 ? aliases.join(', ') : NONE} |`,
    );
  }
  return {
    table: rows.length > 0 ? [ROSTER_HEADER, ROSTER_RULE, ...rows].join('\n') : '',
    rows: rows.length,
    left,
  };
}
