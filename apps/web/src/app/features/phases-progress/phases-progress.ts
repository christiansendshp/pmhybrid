import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { statusCountEntries } from '../../core/status-counts.js';
import { ProjectProgressTree, TasksService } from '../../core/tasks.service.js';
import { ProgressTaskNodeItem } from './progress-task-node.js';

/** Phase/epic/task progress with per-node status-by-count breakdowns and a nested subtask tree (brief §16). */
@Component({
  selector: 'app-phases-progress',
  imports: [ProgressTaskNodeItem],
  templateUrl: './phases-progress.html',
  styleUrl: './phases-progress.scss',
})
export class PhasesProgress implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly tasksService = inject(TasksService);

  readonly tree = signal<ProjectProgressTree | null>(null);
  readonly countsFor = statusCountEntries;

  async ngOnInit(): Promise<void> {
    const projectId = this.route.parent!.snapshot.paramMap.get('projectId')!;
    this.tree.set(await this.tasksService.getProjectProgress(projectId));
  }
}
