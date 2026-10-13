import type { Phase } from './hierarchy.service.js';
import type { TaskCard } from './tasks.service.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** When the ledger says a task was first started and last closed, as the agent's own clock wrote it (Roadmap TASK-23). */
export interface LedgerSpan {
  startedAt: string | null;
  doneAt: string | null;
}

/** The spans by Roadmap ID. */
export type LedgerSpans = Readonly<Record<string, LedgerSpan>>;

/** Where the dates of a bar come from: what the agents wrote in the ledger, or what the record of the task holds. */
export type TimelineBasis = 'LEDGER' | 'RECORD';

export interface TimelineBar {
  card: TaskCard;
  /** Milliseconds since the epoch. */
  start: number;
  /** The close, or null while the task is open. */
  end: number | null;
  /** What the bar runs to: its close, or now for an open one. Never before `start`. */
  until: number;
  basis: TimelineBasis;
  /** Drawn as a mark at `until`, not as a bar: it was closed at once, or in less than a minute, so a bar would have no width. */
  mark: boolean;
  /** Closed under the project's threshold after it was started (Roadmap TASK-12). */
  instant: boolean;
}

export interface TimelinePhase {
  /** The id of the phase, or `none` for the tasks that sit in no phase. */
  key: string;
  name: string;
  bars: TimelineBar[];
  /** Every task the phase has among those the filters keep. */
  total: number;
  /** Of those, the ones that were never started, so there is nothing to draw. */
  notStarted: number;
  /** From the first start to the last close (or to now, while one is open); null when nothing was started. */
  span: { start: number; end: number } | null;
}

export interface Timeline {
  phases: TimelinePhase[];
  /** The time every bar is placed on: from the earliest start to the latest close or now. Null when nothing is drawn. */
  axis: { start: number; end: number } | null;
}

export interface AxisTick {
  at: number;
  /** Position on the axis, 0 to 100. */
  percent: number;
}

const NO_PHASE = 'none';

function parse(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * The bar of one task, or null when it was never started.
 *
 * It starts at the ledger's first IN_PROGRESS. A task the ledger says nothing about starts at its creation, but
 * only once it is in development, in QA or done: one still waiting to be worked has no start to draw. It ends,
 * if the task is done, at the ledger's last DONE, else when the record says it was completed, else when it
 * last changed; a task that is not done is open and runs to now, whatever an old DONE entry says.
 */
export function barOf(
  card: TaskCard,
  span: LedgerSpan | undefined,
  now: number,
): TimelineBar | null {
  const ledgerStart = parse(span?.startedAt);
  let start: number;
  let basis: TimelineBasis;
  if (ledgerStart !== null) {
    start = ledgerStart;
    basis = 'LEDGER';
  } else if (
    card.status === 'EN_DESARROLLO' ||
    card.status === 'QA' ||
    card.status === 'TERMINADA'
  ) {
    const created = parse(card.createdAt);
    if (created === null) {
      return null;
    }
    start = created;
    basis = 'RECORD';
  } else {
    return null;
  }

  let end: number | null = null;
  if (card.status === 'TERMINADA') {
    const candidates = [
      basis === 'LEDGER' ? parse(span?.doneAt) : null,
      parse(card.completedAt),
      parse(card.statusChangedAt),
    ];
    // A close dated before the start (a clock that was wrong) says nothing: the next date that makes sense does.
    end = candidates.find((time): time is number => time !== null && time >= start) ?? start;
  }

  const until = end ?? Math.max(now, start);
  const instant = card.instantClose && end !== null;
  return {
    card,
    start,
    end,
    until,
    basis,
    instant,
    mark: end !== null && (instant || end - start < MINUTE),
  };
}

/** By start; at the same time, by Roadmap ID in natural order (`TASK-2` before `TASK-10`), a task with no ID last. */
function byTime(a: TimelineBar, b: TimelineBar): number {
  return (
    a.start - b.start ||
    (a.card.externalId ?? '￿').localeCompare(b.card.externalId ?? '￿', undefined, {
      numeric: true,
    }) ||
    a.card.id.localeCompare(b.card.id)
  );
}

/**
 * The tasks by phase, each with the time it was worked on (Roadmap TASK-23). `cards` are the tasks the filters
 * keep; a phase none of them belongs to is left out, and the tasks of no phase (or of a phase that no longer
 * exists) are a last group. Phases are in their order; inside one, by start.
 */
export function buildTimeline(
  cards: readonly TaskCard[],
  spans: LedgerSpans,
  phases: readonly Phase[],
  now: number,
): Timeline {
  const known = new Set(phases.map((phase) => phase.id));
  const groups: { key: string; name: string; cards: TaskCard[] }[] = [
    ...[...phases]
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
      .map((phase) => ({ key: phase.id, name: phase.name, cards: [] as TaskCard[] })),
    { key: NO_PHASE, name: 'Sin fase', cards: [] as TaskCard[] },
  ];
  const byKey = new Map(groups.map((group) => [group.key, group]));
  for (const card of cards) {
    const key = card.phaseId && known.has(card.phaseId) ? card.phaseId : NO_PHASE;
    byKey.get(key)!.cards.push(card);
  }

  const result: TimelinePhase[] = groups
    .filter((group) => group.cards.length > 0)
    .map((group) => {
      const bars = group.cards
        .map((card) => barOf(card, card.externalId ? spans[card.externalId] : undefined, now))
        .filter((bar): bar is TimelineBar => bar !== null)
        .sort(byTime);
      return {
        key: group.key,
        name: group.name,
        bars,
        total: group.cards.length,
        notStarted: group.cards.length - bars.length,
        span:
          bars.length === 0
            ? null
            : {
                start: Math.min(...bars.map((bar) => bar.start)),
                end: Math.max(...bars.map((bar) => bar.until)),
              },
      };
    });

  const drawn = result.flatMap((phase) => phase.bars);
  if (drawn.length === 0) {
    return { phases: result, axis: null };
  }
  const start = Math.min(...drawn.map((bar) => bar.start));
  // A day at least, so that one mark alone still has an axis to sit on.
  const end = Math.max(Math.max(...drawn.map((bar) => bar.until)), start + DAY);
  return { phases: result, axis: { start, end } };
}

/** Where a time sits on the axis, as a percentage of its width. */
export function percentOf(time: number, axis: { start: number; end: number }): number {
  return Math.min(100, Math.max(0, ((time - axis.start) / (axis.end - axis.start)) * 100));
}

const STEPS = [HOUR, 6 * HOUR, DAY, 7 * DAY, 30 * DAY, 90 * DAY, 365 * DAY];

/** Marks along the axis, one step apart, with the step chosen so that there are about eight at most. */
export function axisTicks(axis: { start: number; end: number }): AxisTick[] {
  const step =
    STEPS.find((candidate) => (axis.end - axis.start) / candidate <= 8) ?? STEPS[STEPS.length - 1];
  const first = Math.ceil(axis.start / step) * step;
  const ticks: AxisTick[] = [];
  for (let at = first; at <= axis.end; at += step) {
    ticks.push({ at, percent: percentOf(at, axis) });
  }
  return ticks;
}

/**
 * How long a stretch of time is, in the unit that fits: "3 min", "5 h", "12 d". Elapsed time, not calendar days,
 * as the age on a card is counted. Under a minute is "menos de 1 min".
 */
export function lengthText(milliseconds: number): string {
  const length = Math.max(0, milliseconds);
  if (length < MINUTE) {
    return 'menos de 1 min';
  }
  if (length < HOUR) {
    return `${Math.floor(length / MINUTE)} min`;
  }
  if (length < DAY) {
    return `${Math.floor(length / HOUR)} h`;
  }
  return `${Math.floor(length / DAY)} d`;
}
