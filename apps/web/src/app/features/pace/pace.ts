import { DecimalPipe } from '@angular/common';
import { Component, LOCALE_ID, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  chartMax,
  forecastSentence,
  longDate,
  percentOfMax,
  shortDate,
  weeklySentence,
} from '../../core/pace.js';
import { type PaceWeek, PaceService, type ProjectPace } from '../../core/pace.service.js';
import { ScrollCue } from '../../shared/scroll-cue';
import { BurnUp, type BurnUpPoint } from './burn-up.js';

/**
 * How the project moves over time (Roadmap TASK-37): when the open work would end, the tasks closed and created
 * each week, and the burn-up of the project and of each phase. It reads the API once per visit; every chart has
 * a sentence that says what it shows and a table with its numbers, so no figure is only in a drawing or a colour.
 */
@Component({
  selector: 'app-pace',
  imports: [DecimalPipe, BurnUp, ScrollCue],
  templateUrl: './pace.html',
  styleUrl: './pace.scss',
})
export class Pace implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly paceService = inject(PaceService);
  private readonly locale = inject(LOCALE_ID);

  readonly pace = signal<ProjectPace | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);

  readonly forecastText = computed(() => {
    const pace = this.pace();
    return pace ? forecastSentence(pace.forecast, (iso) => longDate(iso, this.locale)) : '';
  });

  readonly weeklyText = computed(() => weeklySentence(this.pace()?.weeks ?? []));

  /** The largest weekly figure, which the bars are measured against. */
  private readonly barMax = computed(() => {
    const weeks = this.pace()?.weeks ?? [];
    return chartMax(
      weeks.map((week) => week.completed),
      weeks.map((week) => week.created),
    );
  });

  readonly project = computed<BurnUpPoint[]>(() =>
    (this.pace()?.weeks ?? []).map((week) => ({
      weekStart: week.weekStart,
      scope: week.scope,
      done: week.done,
      partial: week.partial,
    })),
  );

  readonly phases = computed(() => {
    const pace = this.pace();
    if (!pace) {
      return [];
    }
    const partial = new Map(pace.weeks.map((week) => [week.weekStart, week.partial]));
    return pace.byPhase.map((phase) => ({
      key: phase.phaseId ?? 'none',
      name: phase.name ?? 'Sin fase',
      points: phase.weeks.map<BurnUpPoint>((week) => ({
        ...week,
        partial: partial.get(week.weekStart) ?? false,
      })),
    }));
  });

  async ngOnInit(): Promise<void> {
    const projectId = this.route.parent!.snapshot.paramMap.get('projectId')!;
    try {
      this.pace.set(await this.paceService.get(projectId));
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  shortDate(iso: string): string {
    return shortDate(iso, this.locale);
  }

  longDate(iso: string): string {
    return longDate(iso, this.locale);
  }

  heightOf(week: PaceWeek, key: 'completed' | 'created'): number {
    return percentOfMax(week[key], this.barMax());
  }
}
