import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-base-url.js';

/** One week of the project, Monday to Sunday UTC, as the API draws it (Roadmap TASK-36). */
export interface PaceWeek {
  /** The Monday that opens the week, as an ISO date (`2026-10-19`). */
  weekStart: string;
  completed: number;
  created: number;
  /** Tasks that existed at the end of the week. */
  scope: number;
  /** Tasks finished by the end of the week. */
  done: number;
  /** The week in progress: its figures are those of so far. */
  partial: boolean;
}

/** The scope and done tasks of a phase, week by week, aligned with `weeks`. `phaseId` and `name` are null for the tasks of none. */
export interface PacePhase {
  phaseId: string | null;
  name: string | null;
  weeks: { weekStart: string; scope: number; done: number }[];
}

/** What the pace of the last `weeks` complete weeks says about when the open work ends. */
export interface PaceWindow {
  weeks: number;
  completedPerWeek: number;
  createdPerWeek: number;
  /** With the new work that keeps arriving; null when it never ends. */
  finishesBy: string | null;
  /** If no new work arrived at all. */
  finishesByIgnoringNewScope: string | null;
}

export type ForecastStatus =
  'OK' | 'NOT_ENOUGH_HISTORY' | 'NOTHING_OPEN' | 'NOT_CONVERGING' | 'NO_RECENT_COMPLETIONS';

export interface PaceForecast {
  status: ForecastStatus;
  openTasks: number;
  windows: PaceWindow[];
  /** The earliest and the latest date the windows give, with new work counted; null without any. */
  range: { from: string; to: string } | null;
}

export interface ProjectPace {
  generatedAt: string;
  weeks: PaceWeek[];
  byPhase: PacePhase[];
  forecast: PaceForecast;
}

/** The pace, the burn-up and the forecast of a project (Roadmap TASK-37). */
@Injectable({ providedIn: 'root' })
export class PaceService {
  private readonly http = inject(HttpClient);

  get(projectId: string): Promise<ProjectPace> {
    return firstValueFrom(
      this.http.get<ProjectPace>(`${API_BASE_URL}/projects/${projectId}/metrics/pace`),
    );
  }
}
