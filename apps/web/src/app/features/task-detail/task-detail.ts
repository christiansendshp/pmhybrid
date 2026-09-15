import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { describeAuditChanges } from '../../core/audit-format.js';
import { AuditEvent, AuditService } from '../../core/audit.service.js';
import {
  EMPTY_HIERARCHY,
  HierarchyService,
  ProjectHierarchy,
} from '../../core/hierarchy.service.js';
import { describeHttpError } from '../../core/http-error.js';
import { ProjectMember, ProjectsService } from '../../core/projects.service.js';
import { LEGAL_NEXT_STATUSES } from '../../core/task-status-policy.js';
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

/** Brief §6, §17: every task field, its hierarchy, subtasks, dependencies, agent activity and history. */
@Component({
  selector: 'app-task-detail',
  imports: [DatePipe, FormsModule, RouterLink, MatButtonModule, MatSelectModule, TaskForm],
  templateUrl: './task-detail.html',
  styleUrl: './task-detail.scss',
})
export class TaskDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
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
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly describeChanges = describeAuditChanges;

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
      { label: 'Phase', value: phases.find((phase) => phase.id === task.phaseId)?.name },
      { label: 'Epic', value: epics.find((epic) => epic.id === task.epicId)?.name },
      {
        label: 'Template',
        value: templates.find((template) => template.id === task.templateId)?.name,
      },
      {
        label: 'Parent task',
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
      void this.load();
    });
  }

  private async load(): Promise<void> {
    await this.reload();
    const [members, allTasks, hierarchy] = await Promise.all([
      this.projectsService.listMembers(this.projectId),
      this.tasksService.listForProject(this.projectId),
      this.hierarchyService.load(this.projectId),
    ]);
    this.members.set(members);
    this.allTasks.set(allTasks);
    this.hierarchy.set(hierarchy);
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
    await this.tasksService.transition(this.projectId, this.taskId, status);
    await this.reload();
  }

  async assign(): Promise<void> {
    const actorId = this.selectedAssigneeId();
    if (!actorId) {
      return;
    }
    await this.tasksService.assign(this.projectId, this.taskId, actorId);
    this.selectedAssigneeId.set(null);
    await this.reload();
  }

  async addDependency(): Promise<void> {
    const dependsOnTaskId = this.selectedDependsOnId();
    if (!dependsOnTaskId) {
      return;
    }
    await this.tasksService.addDependency(this.projectId, this.taskId, dependsOnTaskId);
    this.selectedDependsOnId.set(null);
    await this.reload();
  }

  startEditing(): void {
    this.formError.set(null);
    this.addingSubtask.set(false);
    this.editing.set(true);
  }

  startSubtask(): void {
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
      await this.tasksService.create(this.projectId, toCreateTaskInput(value));
      this.addingSubtask.set(false);
    });
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
      this.formError.set(describeHttpError(error, 'The change could not be saved.'));
    } finally {
      this.saving.set(false);
    }
  }
}
