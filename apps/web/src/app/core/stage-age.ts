import { TaskStatus } from './tasks.service.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How a stage reads in a sentence ("en QA hace 2 d"). */
const STAGE_PHRASE: Record<TaskStatus, string> = {
  PENDIENTE: 'pendiente',
  ASIGNADA: 'asignada',
  EN_DESARROLLO: 'en desarrollo',
  QA: 'en QA',
  TERMINADA: 'terminada',
};

/**
 * How long ago a time was, in the unit that fits (Roadmap TASK-13): "ahora", "hace 5 min",
 * "hace 3 h", "hace 2 d". It counts elapsed time, not calendar days, so it does not depend on the
 * time zone or on where midnight falls: 23 hours ago is hours, 25 hours ago is one day, in any zone.
 * A time in the future (a clock that is ahead) reads as now.
 */
export function elapsedText(since: string | Date, now: Date = new Date()): string {
  const elapsed = Math.max(0, now.getTime() - new Date(since).getTime());
  if (elapsed < MINUTE) {
    return 'ahora';
  }
  if (elapsed < HOUR) {
    return `hace ${Math.floor(elapsed / MINUTE)} min`;
  }
  if (elapsed < DAY) {
    return `hace ${Math.floor(elapsed / HOUR)} h`;
  }
  return `hace ${Math.floor(elapsed / DAY)} d`;
}

/**
 * How long a task has been in its stage, as the card says it: "en QA hace 2 d". A finished task
 * has no age worth showing, so it gets none.
 */
export function stageAgeText(
  status: TaskStatus,
  statusChangedAt: string | Date,
  now: Date = new Date(),
): string | null {
  if (status === 'TERMINADA') {
    return null;
  }
  const elapsed = elapsedText(statusChangedAt, now);
  return elapsed === 'ahora'
    ? `${STAGE_PHRASE[status]} ahora`
    : `${STAGE_PHRASE[status]} ${elapsed}`;
}
