import { Component, LOCALE_ID, computed, inject, input } from '@angular/core';
import { burnUpSentence, chartMax, seriesPoints, shortDate } from '../../core/pace.js';
import { ScrollCue } from '../../shared/scroll-cue';

/** The scope and the finished tasks of a project or a phase at the end of a week. */
export interface BurnUpPoint {
  weekStart: string;
  scope: number;
  done: number;
  /** The week in progress. */
  partial: boolean;
}

/**
 * A burn-up (Roadmap TASK-37): the scope and the finished tasks week by week as two lines. The drawing is
 * never the only way to read it: a sentence says how both moved, the two lines differ in stroke and not only
 * in colour, and a table has every figure.
 */
@Component({
  selector: 'app-burn-up',
  imports: [ScrollCue],
  templateUrl: './burn-up.html',
  styleUrl: './burn-up.scss',
})
export class BurnUp {
  private readonly locale = inject(LOCALE_ID);

  /** Whose burn-up it is: the project, or a phase. */
  readonly subject = input.required<string>();
  readonly points = input.required<readonly BurnUpPoint[]>();
  /** The table is open from the start. */
  readonly tableOpen = input(false);

  readonly sentence = computed(() => burnUpSentence(this.subject(), this.points()));
  /** The scope is never below the finished tasks, so it sets the scale of both lines. */
  readonly max = computed(() => chartMax(this.points().map((point) => point.scope)));
  readonly scopeLine = computed(() =>
    seriesPoints(
      this.points().map((point) => point.scope),
      this.max(),
    ),
  );
  readonly doneLine = computed(() =>
    seriesPoints(
      this.points().map((point) => point.done),
      this.max(),
    ),
  );

  dateText(iso: string): string {
    return shortDate(iso, this.locale);
  }
}
