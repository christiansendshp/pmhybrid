import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatSelectModule } from '@angular/material/select';
import { Actor, Project, ProjectsService } from '../../core/projects.service.js';
import { KANBAN_STATUSES } from '../../core/task-status-policy.js';
import { TaskStatus } from '../../core/tasks.service.js';
import { WorkloadRow, WorkloadService } from '../../core/workload.service.js';

/** "¿Quién está haciendo qué?" (brief §18) — my top-level pages: Dashboard / My Projects / Workload. */
@Component({
  selector: 'app-workload',
  imports: [FormsModule, RouterLink, MatSelectModule],
  templateUrl: './workload.html',
})
export class Workload implements OnInit {
  private readonly workloadService = inject(WorkloadService);
  private readonly projectsService = inject(ProjectsService);

  readonly statuses = KANBAN_STATUSES;
  readonly rows = signal<WorkloadRow[]>([]);
  readonly myProjects = signal<Project[]>([]);
  readonly actors = signal<Actor[]>([]);
  readonly loading = signal(true);

  readonly projectFilter = signal<string | null>(null);
  readonly actorFilter = signal<string | null>(null);
  readonly statusFilter = signal<TaskStatus | null>(null);

  async ngOnInit(): Promise<void> {
    const [myProjects, users, agents] = await Promise.all([
      this.projectsService.listMine(),
      this.projectsService.listUsers(),
      this.projectsService.listAgents(),
    ]);
    this.myProjects.set(myProjects);
    this.actors.set([...users, ...agents]);
    await this.reload();
  }

  async onFilterChange(): Promise<void> {
    await this.reload();
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    try {
      this.rows.set(
        await this.workloadService.getWorkload({
          projectId: this.projectFilter() ?? undefined,
          actorId: this.actorFilter() ?? undefined,
          status: this.statusFilter() ?? undefined,
        }),
      );
    } finally {
      this.loading.set(false);
    }
  }
}
