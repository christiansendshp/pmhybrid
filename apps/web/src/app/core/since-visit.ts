import type { NewsTask, ProjectNews } from './since-visit.service.js';

export type NewsKey = 'blocked' | 'conflicts' | 'unblocked' | 'done' | 'newScope';

/** One line of what is new in a project: a sentence with its count, and the first tasks it is about. */
export interface NewsLine {
  key: NewsKey;
  sentence: string;
  tasks: NewsTask[];
  /** Tasks of the kind that are not in `tasks`. */
  more: number;
}

const SENTENCES: Record<NewsKey, (count: number) => string> = {
  blocked: (count) => (count === 1 ? '1 tarea bloqueada' : `${count} tareas bloqueadas`),
  conflicts: (count) => (count === 1 ? '1 conflicto nuevo' : `${count} conflictos nuevos`),
  unblocked: (count) => (count === 1 ? '1 tarea desbloqueada' : `${count} tareas desbloqueadas`),
  done: (count) => (count === 1 ? '1 tarea terminada' : `${count} tareas terminadas`),
  newScope: (count) => (count === 1 ? '1 tarea nueva' : `${count} tareas nuevas`),
};

/**
 * What is new in a project, one line per kind that has something, what needs a person first (blocked, conflicts)
 * and what is only news after. Every count is a sentence, never a bare number (Roadmap TASK-39).
 */
export function newsLines(news: ProjectNews): NewsLine[] {
  const line = (key: Exclude<NewsKey, 'conflicts'>): NewsLine[] => {
    const kind = news[key];
    return kind.count === 0
      ? []
      : [
          {
            key,
            sentence: SENTENCES[key](kind.count),
            tasks: kind.tasks,
            more: Math.max(0, kind.count - kind.tasks.length),
          },
        ];
  };
  const conflicts: NewsLine[] =
    news.conflicts === 0
      ? []
      : [{ key: 'conflicts', sentence: SENTENCES.conflicts(news.conflicts), tasks: [], more: 0 }];
  return [
    ...line('blocked'),
    ...conflicts,
    ...line('unblocked'),
    ...line('done'),
    ...line('newScope'),
  ];
}
