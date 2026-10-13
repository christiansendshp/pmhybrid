/**
 * What an agent does in a task's life (Roadmap TASK-01, EPIC-02): it develops,
 * it reviews (QA), or both. A single agent working alone is `BOTH`, which is
 * why that is the default.
 */
export const AGENT_STAGE_ROLES = ['DEVELOPER', 'QA', 'BOTH'] as const;
export type AgentStageRole = (typeof AGENT_STAGE_ROLES)[number];
