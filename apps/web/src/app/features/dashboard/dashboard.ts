import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { describeHttpError } from '../../core/http-error.js';
import {
  DashboardActivity,
  DashboardService,
  DashboardSummary,
} from '../../core/dashboard.service.js';
import { statusLabel } from '../../core/task-status-policy.js';

/** Brief §14 "DASHBOARD PRINCIPAL" — cross-project summary + activity. */
@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, DecimalPipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  private readonly dashboardService = inject(DashboardService);

  readonly summary = signal<DashboardSummary | null>(null);
  readonly activity = signal<DashboardActivity | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [summary, activity] = await Promise.all([
        this.dashboardService.getSummary(),
        this.dashboardService.getActivity(),
      ]);
      this.summary.set(summary);
      this.activity.set(activity);
    } catch (error) {
      this.error.set(describeHttpError(error, 'No se pudo cargar el panel.'));
    } finally {
      this.loading.set(false);
    }
  }

  readonly statusLabel = statusLabel;
}
