import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { actorKindLabel } from '../../core/actor-kind.js';
import { Actor, ActorsService } from '../../core/actors.service.js';
import {
  EMPTY_HIERARCHY,
  HierarchyService,
  ProjectHierarchy,
} from '../../core/hierarchy.service.js';
import { describeHttpError } from '../../core/http-error.js';
import { Project, ProjectsService } from '../../core/projects.service.js';
import {
  KANBAN_STATUSES,
  statusLabel as formatStatusLabel,
} from '../../core/task-status-policy.js';
import { TaskStatus } from '../../core/tasks.service.js';
import { WorkloadFilters, WorkloadRow, WorkloadService } from '../../core/workload.service.js';

/**
 * "¿Quién está haciendo qué?" (brief §18): every active actor with what they
 * are assigned across the user's projects, filterable by project, people or
 * agents, actor, status, and — within a chosen project — phase and epic.
 */
@Component({
  selector: 'app-workload',
  imports: [
    DecimalPipe,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
  ],
  templateUrl: './workload.html',
  styleUrl: './workload.scss',
})
export class Workload implements OnInit {
  private readonly workloadService = inject(WorkloadService);
  private readonly projectsService = inject(ProjectsService);
  private readonly actorsService = inject(ActorsService);
  private readonly hierarchyService = inject(HierarchyService);

  readonly statuses = KANBAN_STATUSES;
  readonly kindLabel = actorKindLabel;

  readonly rows = signal<WorkloadRow[]>([]);
  readonly myProjects = signal<Project[]>([]);
  readonly actors = signal<Actor[]>([]);
  readonly hierarchy = signal<ProjectHierarchy>(EMPTY_HIERARCHY);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly filters = signal<WorkloadFilters>({});

  readonly actorOptions = computed(() => {
    const kind = this.filters().kind;
    return this.actors().filter((actor) => actor.isActive && (!kind || actor.kind === kind));
  });

  /** Epics of the chosen phase, plus those outside any phase. */
  readonly epicOptions = computed(() => {
    const phaseId = this.filters().phaseId;
    return this.hierarchy().epics.filter(
      (epic) => !phaseId || !epic.phaseId || epic.phaseId === phaseId,
    );
  });

  readonly counts = computed(() => {
    const rows = this.rows();
    return {
      actors: new Set(rows.map((row) => row.actor.id)).size,
      tasks: rows.filter((row) => row.task).length,
      idle: rows.filter((row) => !row.task).length,
    };
  });

  readonly hasFilters = computed(() => Object.values(this.filters()).some(Boolean));

  async ngOnInit(): Promise<void> {
    try {
      const [myProjects, users, agents] = await Promise.all([
        this.projectsService.listMine(),
        this.actorsService.listUsers(),
        this.actorsService.listAgents(),
      ]);
      this.myProjects.set(myProjects);
      this.actors.set([...users, ...agents]);
    } catch (error) {
      this.error.set(describeHttpError(error, 'The filters could not be loaded.'));
    }
    await this.reload();
  }

  /** Applies one filter change; a select's "all" option arrives as null. */
  async setFilter(patch: {
    [K in keyof WorkloadFilters]?: WorkloadFilters[K] | null;
  }): Promise<void> {
    const next: WorkloadFilters = { ...this.filters() };
    for (const [key, value] of Object.entries(patch)) {
      (next as Record<string, unknown>)[key] = value ?? undefined;
    }
    if ('projectId' in patch) {
      // Phases and epics belong to one project.
      next.phaseId = undefined;
      next.epicId = undefined;
      this.hierarchy.set(
        next.projectId ? await this.hierarchyService.load(next.projectId) : EMPTY_HIERARCHY,
      );
    }
    if ('kind' in patch && next.kind && next.actorId) {
      const actor = this.actors().find((candidate) => candidate.id === next.actorId);
      if (actor?.kind !== next.kind) {
        next.actorId = undefined;
      }
    }
    if ('phaseId' in patch && next.epicId) {
      const epic = this.hierarchy().epics.find((candidate) => candidate.id === next.epicId);
      if (next.phaseId && epic?.phaseId && epic.phaseId !== next.phaseId) {
        next.epicId = undefined;
      }
    }
    this.filters.set(next);
    await this.reload();
  }

  async clearFilters(): Promise<void> {
    this.filters.set({});
    this.hierarchy.set(EMPTY_HIERARCHY);
    await this.reload();
  }

  statusLabel(status: TaskStatus | null): string {
    return status ? formatStatusLabel(status) : '';
  }

  plural(count: number, noun: string): string {
    return `${count} ${noun}${count === 1 ? '' : 's'}`;
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    try {
      this.rows.set(await this.workloadService.getWorkload(this.filters()));
      this.error.set(null);
    } catch (error) {
      this.error.set(describeHttpError(error, 'The workload could not be loaded.'));
    } finally {
      this.loading.set(false);
    }
  }
}
