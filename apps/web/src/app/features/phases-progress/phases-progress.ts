import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { statusCountEntries } from '../../core/status-counts.js';
import { statusLabel } from '../../core/task-status-policy.js';
import { ProjectProgressTree, TasksService } from '../../core/tasks.service.js';
import { ProgressBar } from '../../shared/progress-bar/progress-bar.js';
import { ProgressTaskNodeItem } from './progress-task-node.js';

/** Phase/epic/task progress with per-node status-by-count breakdowns and a nested subtask tree (brief §16). */
@Component({
  selector: 'app-phases-progress',
  imports: [ProgressBar, ProgressTaskNodeItem],
  templateUrl: './phases-progress.html',
  styleUrl: './phases-progress.scss',
})
export class PhasesProgress implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly tasksService = inject(TasksService);

  readonly tree = signal<ProjectProgressTree | null>(null);
  readonly loading = signal(true);
  readonly countsFor = statusCountEntries;
  readonly statusLabel = statusLabel;

  async ngOnInit(): Promise<void> {
    const projectId = this.route.parent!.snapshot.paramMap.get('projectId')!;
    this.loading.set(true);
    try {
      this.tree.set(await this.tasksService.getProjectProgress(projectId));
    } finally {
      this.loading.set(false);
    }
  }
}
