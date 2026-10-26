/**
 * What an agent does in a task's life (Roadmap TASK-01, EPIC-02): it develops,
 * it reviews (QA), or both. A single agent working alone is `BOTH`, which is
 * why that is the default.
 */
export const AGENT_STAGE_ROLES = ['DEVELOPER', 'QA', 'BOTH'] as const;
export type AgentStageRole = (typeof AGENT_STAGE_ROLES)[number];

/**
 * The columns of the project-documentation skill's roster (the `## Agent identity` table of its AGENTS.md
 * template), in its order (Roadmap TASK-25). The Team page builds the table from them, and a test of the
 * API compares them with the template, so a skill that changes its roster fails there and not in a project.
 */
export const AGENT_ROSTER_COLUMNS = ['Agent id', 'Kind', 'Model', 'Role', 'Aliases'] as const;
