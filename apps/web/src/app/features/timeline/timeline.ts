import { formatDate } from '@angular/common';
import { Component, LOCALE_ID, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Phase } from '../../core/hierarchy.service.js';
import type { TaskCard } from '../../core/tasks.service.js';
import {
  type LedgerSpans,
  type TimelineBar,
  type TimelinePhase,
  axisTicks,
  buildTimeline,
  lengthText,
  percentOf,
} from '../../core/timeline.js';
import { ShortTitlePipe } from '../../shared/short-title.pipe.js';

/** Past this many drawn tasks the phases that have nothing open start closed, so the page is not a wall of rows. */
const OPEN_ALL_UP_TO = 80;

/**
 * The tasks of the project by phase, each as the stretch of time it was worked on (Roadmap TASK-23): from the
 * ledger's first IN_PROGRESS to its DONE, or from creation to completion for a task the ledger knows nothing
 * about. A task closed at once is a mark, not a bar of no width. The drawing is never the only way to know a
 * date: every row says its dates, how long it lasted and where they come from, in words.
 */
@Component({
  selector: 'app-timeline',
  imports: [RouterLink, ShortTitlePipe],
  templateUrl: './timeline.html',
  styleUrl: './timeline.scss',
})
export class Timeline {
  private readonly locale = inject(LOCALE_ID);

  /** The tasks the filters keep. */
  readonly cards = input.required<TaskCard[]>();
  readonly spans = input.required<LedgerSpans>();
  readonly phases = input.required<Phase[]>();
  /** The project's threshold for an instant close, in minutes, for the legend. */
  readonly instantMinutes = input(5);
  /** The ledger's spans could not be read: said, because the dates then come from the tasks alone. */
  readonly spansFailed = input(false);
  /** The time the open bars run to; the present unless a test says otherwise. */
  readonly now = input<number | null>(null);

  readonly timeline = computed(() =>
    buildTimeline(this.cards(), this.spans(), this.phases(), this.now() ?? Date.now()),
  );

  readonly ticks = computed(() => {
    const axis = this.timeline().axis;
    return axis ? axisTicks(axis) : [];
  });

  /** What the person opened or closed by hand; a phase not in it follows the default. */
  private readonly chosen = signal<ReadonlyMap<string, boolean>>(new Map());

  private readonly drawnCount = computed(() =>
    this.timeline().phases.reduce((sum, phase) => sum + phase.bars.length, 0),
  );

  isOpen(phase: TimelinePhase): boolean {
    return (
      this.chosen().get(phase.key) ??
      (this.drawnCount() <= OPEN_ALL_UP_TO || phase.bars.some((bar) => bar.end === null))
    );
  }

  toggle(phase: TimelinePhase): void {
    this.chosen.update((chosen) => new Map(chosen).set(phase.key, !this.isOpen(phase)));
  }

  setAll(open: boolean): void {
    this.chosen.set(new Map(this.timeline().phases.map((phase) => [phase.key, open])));
  }

  /** Where on the axis a time sits, as a percentage. */
  at(time: number): number {
    const axis = this.timeline().axis;
    return axis ? percentOf(time, axis) : 0;
  }

  /** How wide a bar is on the axis; never so thin that it disappears. */
  widthOf(bar: TimelineBar): number {
    return Math.max(0.4, this.at(bar.until) - this.at(bar.start));
  }

  tickLabel(time: number): string {
    return formatDate(time, 'd MMM', this.locale);
  }

  private day(time: number): string {
    return formatDate(time, 'd MMM HH:mm', this.locale);
  }

  /** The days a phase covers, without the hour: the rows have the hours. */
  spanText(phase: TimelinePhase): string {
    if (!phase.span) {
      return 'ninguna tarea iniciada';
    }
    const first = this.tickLabel(phase.span.start);
    const last = this.tickLabel(phase.span.end);
    return first === last ? first : `${first} – ${last}`;
  }

  /** What a row says in words about its dates, so the bar is never the only place they are. */
  whenText(bar: TimelineBar): string {
    const source =
      bar.basis === 'LEDGER'
        ? 'fechas del registro de agentes'
        : 'fechas de la tarea, sin registro de agentes';
    if (bar.end === null) {
      return `desde ${this.day(bar.start)}; abierta, ${lengthText(bar.until - bar.start)}; ${source}`;
    }
    const length = lengthText(bar.end - bar.start);
    if (bar.instant) {
      return `cierre inmediato: ${this.day(bar.end)}, ${length} después de iniciar; ${source}`;
    }
    if (bar.mark) {
      return `cerrada ${this.day(bar.end)}, ${length} después de iniciar; ${source}`;
    }
    return `${this.day(bar.start)} → ${this.day(bar.end)}; ${length}; ${source}`;
  }

  trackPhase(phase: TimelinePhase): string {
    return phase.key;
  }

  trackBar(bar: TimelineBar): string {
    return bar.card.id;
  }
}
