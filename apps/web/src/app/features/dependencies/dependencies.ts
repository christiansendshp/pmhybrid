import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { pathSentence } from '../../core/risks.js';
import type { ProjectRisks, WaitingTask } from '../../core/risks.service.js';
import { statusLabel } from '../../core/task-status-policy.js';

/**
 * What blocks what, and the critical path (Roadmap TASK-22): a view of the project's tasks that reads what the
 * risks of the project already compute (TASK-43, TASK-44) and works out nothing of its own. The critical path is the
 * project's; what waits for what follows the filters of the board, like the other views.
 */
@Component({
  selector: 'app-dependencies',
  imports: [RouterLink],
  templateUrl: './dependencies.html',
  styleUrl: './dependencies.scss',
})
export class DependenciesView {
  readonly projectId = input.required<string>();
  /** The risks of the project; null while they are read. */
  readonly risks = input<ProjectRisks | null>(null);
  /** The risks could not be read. */
  readonly failed = input(false);
  /** The ids of the tasks the board's filters keep; null when none is on, so nothing is left out. */
  readonly visibleTaskIds = input<ReadonlySet<string> | null>(null);

  readonly statusLabel = statusLabel;

  readonly pathText = computed(() => pathSentence(this.risks()?.criticalPath ?? []));

  /** What waits for what, among the tasks the filters keep. */
  readonly waiting = computed<WaitingTask[]>(() => {
    const visible = this.visibleTaskIds();
    return (this.risks()?.waiting ?? []).filter((entry) => !visible || visible.has(entry.task.id));
  });

  readonly summary = computed(() => {
    const count = this.waiting().length;
    if (count === 0) {
      return 'Ninguna tarea abierta espera a otra.';
    }
    return `${count === 1 ? '1 tarea abierta espera' : `${count} tareas abiertas esperan`} a otras, la que espera a más primero.`;
  });
}
