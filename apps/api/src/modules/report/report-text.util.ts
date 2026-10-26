import type { RiskKind, RiskSignal } from '../risks/risks.util.js';

const HOUR_LIMIT = 48;

/** Hours as a person says them: under two days in hours, then in days. */
export function idleText(hours: number): string {
  return hours < HOUR_LIMIT ? `${hours} h` : `${Math.floor(hours / 24)} días`;
}

const name = (task: { externalId: string | null; title: string }): string =>
  task.externalId ? `${task.externalId} ${task.title}` : task.title;

/** What is wrong with the task of a signal, in a sentence for the report (Roadmap TASK-48). */
export function signalDetail(signal: RiskSignal): string {
  switch (signal.kind) {
    case 'OVERDUE':
      return signal.dueDate
        ? `Fuera de plazo (debía estar terminada el ${signal.dueDate.slice(0, 10)})`
        : 'Fuera de plazo';
    case 'BLOCKED_BY_BLOCKED':
      return `Depende de una tarea bloqueada: ${(signal.blockedBy ?? []).map(name).join(', ')}`;
    case 'UNOWNED_IN_DEVELOPMENT':
      return 'En desarrollo y sin responsable';
    case 'STALE_IN_DEVELOPMENT':
      return signal.idleHours === undefined
        ? 'En desarrollo y sin actividad'
        : `En desarrollo y sin actividad hace ${idleText(signal.idleHours)}`;
  }
}

const REASONS: readonly [RiskKind, (count: number) => string][] = [
  ['OVERDUE', (count) => `${count} fuera de plazo`],
  [
    'BLOCKED_BY_BLOCKED',
    (count) =>
      `${count} ${count === 1 ? 'espera a una bloqueada' : 'esperan a una bloqueada'}`,
  ],
  [
    'UNOWNED_IN_DEVELOPMENT',
    (count) => `${count} en desarrollo sin responsable`,
  ],
  ['STALE_IN_DEVELOPMENT', (count) => `${count} sin actividad en desarrollo`],
];

/** What counts against a semaphore, as the sentences of the report: each signal that has a count, and the blocked tasks. */
export function riskReasons(
  counts: Record<RiskKind, number>,
  blocked: number,
): string[] {
  return [
    ...REASONS.flatMap(([kind, say]) =>
      counts[kind] === 0 ? [] : [say(counts[kind])],
    ),
    ...(blocked === 0
      ? []
      : [blocked === 1 ? '1 bloqueada' : `${blocked} bloqueadas`]),
  ];
}
