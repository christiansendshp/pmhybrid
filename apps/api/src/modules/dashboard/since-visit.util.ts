/** Days back a person is read from when they have never marked a project as seen (Roadmap TASK-38). */
export const DEFAULT_WINDOW_DAYS = 7;

/** How many tasks of each kind are named; the count is always of all of them. */
export const MAX_TASKS_LISTED = 10;

const DAY = 24 * 60 * 60 * 1000;

/** Enough of a task to name it and open it. */
export interface NewsTask {
  id: string;
  externalId: string | null;
  title: string;
}

/** One kind of news about a project: how many tasks, and the first of them. */
export interface NewsKind {
  count: number;
  tasks: NewsTask[];
}

/** What happened in one project since a person last marked it as seen. */
export interface ProjectNews {
  projectId: string;
  name: string;
  /** Where the count starts, as an ISO time: the person's marker, or the default window back from now. */
  since: string;
  /** Tasks completed. */
  done: NewsKind;
  /** Tasks now in the Blocked table that were put there. */
  blocked: NewsKind;
  /** Tasks taken out of the Blocked table that are neither blocked nor done now. */
  unblocked: NewsKind;
  /** Tasks that appeared. */
  newScope: NewsKind;
  /** Conflicts opened and still open. */
  conflicts: number;
}

/** Where the news of a project starts for a person: their marker, or the last 7 days when they have none. */
export function sinceOf(seenAt: Date | null, now: Date): Date {
  return seenAt ?? new Date(now.getTime() - DEFAULT_WINDOW_DAYS * DAY);
}

/** A kind of news from the tasks it is about, naming the first ones and counting them all. */
export function newsKind(
  tasks: readonly NewsTask[],
  count = tasks.length,
): NewsKind {
  return {
    count,
    tasks: tasks
      .slice(0, MAX_TASKS_LISTED)
      .map(({ id, externalId, title }) => ({
        id,
        externalId,
        title,
      })),
  };
}

/** Whether there is anything to say about the project: a project with nothing new is not listed. */
export function hasNews(news: ProjectNews): boolean {
  return (
    news.done.count > 0 ||
    news.blocked.count > 0 ||
    news.unblocked.count > 0 ||
    news.newScope.count > 0 ||
    news.conflicts > 0
  );
}

interface AuditedChange {
  entityId: string;
  newValue: unknown;
}

/**
 * The tasks an audit event says were taken out of the Blocked table (the caller gives the events whose previous
 * value was Blocked): not the ones that stayed in it, and not the ones the change completed, which are done and
 * not unblocked.
 */
export function unblockedIds(changes: readonly AuditedChange[]): string[] {
  const ids = new Set<string>();
  for (const change of changes) {
    const next = (change.newValue ?? {}) as {
      roadmapTable?: unknown;
      status?: unknown;
    };
    if (next.roadmapTable !== 'BLOCKED' && next.status !== 'TERMINADA') {
      ids.add(change.entityId);
    }
  }
  return [...ids];
}
