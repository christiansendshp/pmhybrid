import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ProjectProgressTree, TasksService } from '../../core/tasks.service.js';

@Component({
  selector: 'app-phases-progress',
  templateUrl: './phases-progress.html',
})
export class PhasesProgress implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly tasksService = inject(TasksService);

  readonly tree = signal<ProjectProgressTree | null>(null);

  async ngOnInit(): Promise<void> {
    const projectId = this.route.parent!.snapshot.paramMap.get('projectId')!;
    this.tree.set(await this.tasksService.getProjectProgress(projectId));
  }
}
