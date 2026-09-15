import { Component, OnInit, inject, signal } from '@angular/core';
import {
  DashboardActivity,
  DashboardService,
  DashboardSummary,
} from '../../core/dashboard.service.js';

/** Brief §14 "DASHBOARD PRINCIPAL" — cross-project summary + activity. */
@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.html',
})
export class Dashboard implements OnInit {
  private readonly dashboardService = inject(DashboardService);

  readonly summary = signal<DashboardSummary | null>(null);
  readonly activity = signal<DashboardActivity | null>(null);
  readonly loading = signal(true);

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      const [summary, activity] = await Promise.all([
        this.dashboardService.getSummary(),
        this.dashboardService.getActivity(),
      ]);
      this.summary.set(summary);
      this.activity.set(activity);
    } finally {
      this.loading.set(false);
    }
  }
}
