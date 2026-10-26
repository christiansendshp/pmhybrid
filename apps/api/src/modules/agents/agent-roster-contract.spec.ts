import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  AGENT_ROSTER_COLUMNS,
  AGENT_STAGE_ROLES,
} from '@pmhybrid/shared-types';
import { describe, expect, it } from 'vitest';

/** The skill's own AGENTS.md template: where its roster is defined. */
const TEMPLATE = readFileSync(
  path.resolve(
    process.cwd(),
    '../../.claude/skills/project-documentation/templates/AGENTS.md',
  ),
  'utf-8',
).replace(/\r\n/g, '\n');

/**
 * The Team page offers the skill's roster table (Roadmap TASK-25). It is built from constants of
 * this repository, so this is where a skill that changes its roster is noticed: when its template
 * stops saying what the app writes, the copy of the skill is no longer one the page can serve.
 */
describe('The roster the Team page offers matches the skill template (Roadmap TASK-25)', () => {
  it('has the same columns, in the same order', () => {
    expect(TEMPLATE).toContain(`| ${AGENT_ROSTER_COLUMNS.join(' | ')} |`);
  });

  it('has the same separator row, with no padding', () => {
    expect(TEMPLATE).toContain(
      `|${AGENT_ROSTER_COLUMNS.map(() => '---').join('|')}|`,
    );
  });

  it('names the same roles', () => {
    const [first, second, last] = AGENT_STAGE_ROLES;

    expect(TEMPLATE).toContain(`Role: ${first}, ${second} or ${last}`);
  });

  it('names the kinds an agent can have, and the app writes AI for its agents', () => {
    expect(TEMPLATE).toContain('Kind: HUMAN or AI');
  });
});
