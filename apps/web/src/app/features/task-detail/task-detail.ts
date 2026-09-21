import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { LabelPipe } from '../../shared/label.pipe.js';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { actorKindLabel } from '../../core/actor-kind.js';
import { describeAuditChanges } from '../../core/audit-format.js';
import { AuditEvent, AuditService } from '../../core/audit.service.js';
import {
  EMPTY_HIERARCHY,
  HierarchyService,
  ProjectHierarchy,
} from '../../core/hierarchy.service.js';
import { describeHttpError } from '../../core/http-error.js';
import { newIdempotencyKey } from '../../core/idempotency-key.js';
import { ProjectMember, ProjectsService } from '../../core/projects.service.js';
import { LEGAL_NEXT_STATUSES, statusLabel } from '../../core/task-status-policy.js';
import {
  Task,
  TaskDetail as TaskDetailModel,
  TaskStatus,
  TasksService,
} from '../../core/tasks.service.js';
import {
  TaskForm,
  TaskFormValue,
  toCreateTaskInput,
  toUpdateTaskInput,
} from '../../shared/task-form/task-form.js';

const HISTORY_LIMIT = 50;
const TASK_DELETE = 'task.delete';
const TASK_WRITE = 'task.write';

/** Brief §6, §17: every task field, its hierarchy, subtasks, dependencies, agent activity and history. */
@Component({
  selector: 'app-task-detail',
  imports: [
    LabelPipe,
    DatePipe,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatSelectModule,
    TaskForm,
  ],
  templateUrl: './task-detail.html',
  styleUrl: './task-detail.scss',
})
export class TaskDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tasksService = inject(TasksService);
  private readonly projectsService = inject(ProjectsService);
  private readonly auditService = inject(AuditService);
  private readonly hierarchyService = inject(HierarchyService);

  readonly task = signal<TaskDetailModel | null>(null);
  readonly history = signal<AuditEvent[]>([]);
  readonly members = signal<ProjectMember[]>([]);
  readonly allTasks = signal<Task[]>([]);
  readonly hierarchy = signal<ProjectHierarchy>(EMPTY_HIERARCHY);
  readonly selectedAssigneeId = signal<string | null>(null);
  readonly selectedDependsOnId = signal<string | null>(null);
  readonly editing = signal(false);
  readonly addingSubtask = signal(false);
  /** Names this subtask form's creation, so retrying it cannot make two (Roadmap BUG-07b). */
  private subtaskKey = newIdempotencyKey();
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  /** Hides a doomed action only; the API enforces task.delete regardless. */
  readonly canDelete = signal(false);
  /** Creating/editing a task and declaring dependencies need `task.write`; the API enforces it regardless (Roadmap SECURITY-02). */
  readonly canWrite = signal(false);
  readonly confirmingDelete = signal(false);
  readonly deleting = signal(false);
  readonly deleteError = signal<string | null>(null);
  /** Why the last move, assignment or dependency did not happen — shown, never swallowed (Roadmap UX-01). */
  readonly actionError = signal<string | null>(null);
  readonly acting = signal(false);
  /** The task does not exist (or was removed): a page of its own, not a blank one. */
  readonly notFound = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly describeChanges = describeAuditChanges;
  readonly actorKindLabel = actorKindLabel;
  readonly statusLabel = statusLabel;

  readonly otherTasks = computed(() =>
    this.allTasks().filter((task) => task.id !== this.task()?.id),
  );

  /** Where the task sits in the hierarchy, by name (brief §17 "jerarquía"). */
  readonly placement = computed(() => {
    const task = this.task();
    if (!task) {
      return [];
    }
    const { phases, epics, templates } = this.hierarchy();
    const entries = [
      { label: 'Fase', value: phases.find((phase) => phase.id === task.phaseId)?.name },
      { label: 'Épica', value: epics.find((epic) => epic.id === task.epicId)?.name },
      {
        label: 'Plantilla',
        value: templates.find((template) => template.id === task.templateId)?.name,
      },
      {
        label: 'Tarea superior',
        value: this.allTasks().find((other) => other.id === task.parentTaskId)?.title,
      },
    ];
    return entries.filter((entry): entry is { label: string; value: string } =>
      Boolean(entry.value),
    );
  });

  private get projectId(): string {
    return this.route.parent!.snapshot.paramMap.get('projectId')!;
  }

  private get taskId(): string {
    return this.route.snapshot.paramMap.get('taskId')!;
  }

  legalNextStatuses(): TaskStatus[] {
    const current = this.task()?.status;
    return current ? LEGAL_NEXT_STATUSES[current] : [];
  }

  ngOnInit(): void {
    // The router reuses this component when moving between a task and its
    // subtasks or parent, so every change of task id reloads the view.
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.editing.set(false);
      this.addingSubtask.set(false);
      this.confirmingDelete.set(false);
      this.deleteError.set(null);
      this.actionError.set(null);
      this.notFound.set(false);
      this.loadError.set(null);
      void this.load();
    });
  }

  private async load(): Promise<void> {
    try {
      await this.reload();
    } catch (error) {
      this.task.set(null);
      if (error instanceof HttpErrorResponse && error.status === 404) {
        this.notFound.set(true);
      } else {
        this.loadError.set(describeHttpError(error, 'No se pudo cargar la tarea.'));
      }
      return;
    }
    const [members, allTasks, hierarchy, permissions] = await Promise.all([
      this.projectsService.listMembers(this.projectId),
      this.tasksService.listForProject(this.projectId),
      this.hierarchyService.load(this.projectId),
      this.projectsService.myPermissions(this.projectId),
    ]);
    this.members.set(members);
    this.allTasks.set(allTasks);
    this.hierarchy.set(hierarchy);
    this.canDelete.set(permissions.includes(TASK_DELETE));
    this.canWrite.set(permissions.includes(TASK_WRITE));
  }

  /** Task and its change history together, so the history always reflects the action just taken (brief §17). */
  private async reload(): Promise<void> {
    const [task, history] = await Promise.all([
      this.tasksService.getById(this.projectId, this.taskId),
      this.auditService.listForProject(this.projectId, {
        entityType: 'Task',
        entityId: this.taskId,
        limit: HISTORY_LIMIT,
      }),
    ]);
    this.task.set(task);
    this.history.set(history);
  }

  async transition(status: TaskStatus): Promise<void> {
    await this.runAction(
      () => this.tasksService.transition(this.projectId, this.taskId, status),
      'No se pudo cambiar el estado.',
    );
  }

  async assign(): Promise<void> {
    const actorId = this.selectedAssigneeId();
    if (!actorId) {
      return;
    }
    await this.runAction(async () => {
      await this.tasksService.assign(this.projectId, this.taskId, actorId);
      this.selectedAssigneeId.set(null);
    }, 'No se pudo asignar la tarea.');
  }

  async addDependency(): Promise<void> {
    const dependsOnTaskId = this.selectedDependsOnId();
    if (!dependsOnTaskId) {
      return;
    }
    await this.runAction(async () => {
      await this.tasksService.addDependency(this.projectId, this.taskId, dependsOnTaskId);
      this.selectedDependsOnId.set(null);
    }, 'No se pudo añadir la dependencia.');
  }

  /**
   * One place for the buttons that change the task in place: a 403 (missing
   * permission), a 409 (someone else changed it first, including the locked
   * assignee of brief §7) or a 422 (the document could not be written) is
   * shown as what it is, and the task is reloaded either way so the screen
   * shows what is really there rather than what was attempted.
   */
  private async runAction(action: () => Promise<unknown>, fallback: string): Promise<void> {
    if (this.acting()) {
      return;
    }
    this.acting.set(true);
    this.actionError.set(null);
    try {
      await action();
    } catch (error) {
      this.actionError.set(describeHttpError(error, fallback));
    } finally {
      this.acting.set(false);
    }
    try {
      await this.reload();
    } catch {
      // The action's own message is the one that matters.
    }
  }

  startEditing(): void {
    this.formError.set(null);
    this.addingSubtask.set(false);
    this.editing.set(true);
  }

  startSubtask(): void {
    this.subtaskKey = newIdempotencyKey();
    this.formError.set(null);
    this.editing.set(false);
    this.addingSubtask.set(true);
  }

  async saveEdit(value: TaskFormValue): Promise<void> {
    await this.submitForm(async () => {
      await this.tasksService.update(this.projectId, this.taskId, toUpdateTaskInput(value));
      this.editing.set(false);
    });
  }

  async createSubtask(value: TaskFormValue): Promise<void> {
    await this.submitForm(async () => {
      await this.tasksService.create(this.projectId, toCreateTaskInput(value), this.subtaskKey);
      this.subtaskKey = newIdempotencyKey();
      this.addingSubtask.set(false);
    });
  }

  /** Brief §25: removes the task (after the inline confirmation) and returns to the board. */
  async deleteTask(): Promise<void> {
    if (this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.deleteError.set(null);
    try {
      await this.tasksService.remove(this.projectId, this.taskId);
      await this.router.navigate(['kanban'], { relativeTo: this.route.parent });
    } catch (error) {
      this.deleteError.set(describeHttpError(error, 'No se pudo eliminar la tarea.'));
      this.confirmingDelete.set(false);
    } finally {
      this.deleting.set(false);
    }
  }

  private async submitForm(action: () => Promise<void>): Promise<void> {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.formError.set(null);
    try {
      await action();
      await this.reload();
      this.allTasks.set(await this.tasksService.listForProject(this.projectId));
    } catch (error) {
      this.formError.set(describeHttpError(error, 'No se pudo guardar el cambio.'));
    } finally {
      this.saving.set(false);
    }
  }
}
