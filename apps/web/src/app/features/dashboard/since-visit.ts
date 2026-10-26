import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { newsLines } from '../../core/since-visit.js';
import { SinceVisitService, type ProjectNews } from '../../core/since-visit.service.js';

/**
 * "Desde tu última visita" (Roadmap TASK-39): what changed in each of the person's projects since they last
 * marked it as seen. The marker moves only with "Marcar como visto", so opening a task from here never hides
 * the rest. It reads on its own and says when it cannot, so the rest of the Panel is never held up by it.
 */
@Component({
  selector: 'app-since-visit',
  imports: [DatePipe, RouterLink],
  templateUrl: './since-visit.html',
  styleUrl: './since-visit.scss',
})
export class SinceVisit implements OnInit {
  private readonly service = inject(SinceVisitService);

  readonly projects = signal<ProjectNews[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);
  /** The marker could not be moved. */
  readonly markFailed = signal(false);
  /** A call to move the marker is in flight. */
  readonly marking = signal(false);

  readonly lines = newsLines;

  async ngOnInit(): Promise<void> {
    try {
      this.projects.set((await this.service.get()).projects);
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** Marks one project as seen, or all of them, and takes what was marked off the list. */
  async markSeen(projectId?: string): Promise<void> {
    this.marking.set(true);
    this.markFailed.set(false);
    try {
      const { projectIds } = await this.service.markSeen(projectId ? [projectId] : undefined);
      const marked = new Set(projectIds);
      this.projects.update((projects) =>
        projects.filter((project) => !marked.has(project.projectId)),
      );
    } catch {
      this.markFailed.set(true);
    } finally {
      this.marking.set(false);
    }
  }
}
