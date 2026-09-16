import { Component, OnInit, computed, inject, input, output } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ProjectHierarchy } from '../../core/hierarchy.service.js';
import {
  CreateTaskInput,
  TASK_PRIORITIES,
  Task,
  TaskPriority,
  UpdateTaskInput,
} from '../../core/tasks.service.js';

/** What a task hangs from, as one answer (brief §9): nothing, or its most specific parent instance. */
export type ParentInstance =
  'none' | `phase:${string}` | `epic:${string}` | `template:${string}` | `task:${string}`;

type HierarchyLinks = Pick<Task, 'phaseId' | 'epicId' | 'templateId' | 'parentTaskId'>;

/**
 * The form's answer. Optional fields are `null` when empty; in edit mode the
 * hierarchy links are left out unless the parent instance was changed, and
 * `progressPercent` is left out while progress is derived from subtasks.
 */
export interface TaskFormValue extends Partial<HierarchyLinks> {
  title: string;
  acceptanceCriteria: string;
  description: string | null;
  priority: TaskPriority | null;
  progressPercent?: number | null;
  startDate: string | null;
  estimatedDate: string | null;
  dueDate: string | null;
}

const NOT_BLANK = /\S/;

/**
 * Create and edit form for a task (brief §6, §9): the Roadmap's required
 * columns (title, acceptance criteria) plus an explicit answer to "which
 * parent instance does this task depend on?", then the optional details.
 */
@Component({
  selector: 'app-task-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './task-form.html',
  styleUrl: './task-form.scss',
})
export class TaskForm implements OnInit {
  private readonly fb = inject(FormBuilder);

  readonly hierarchy = input.required<ProjectHierarchy>();
  /** Candidate parent tasks. */
  readonly tasks = input<Task[]>([]);
  /** The task being edited; create mode when null. */
  readonly task = input<Task | null>(null);
  /** Preselected parent task, for adding a subtask. */
  readonly parentTaskId = input<string | null>(null);
  readonly progressDerived = input(false);
  readonly submitting = input(false);
  readonly errorMessage = input<string | null>(null);
  readonly submitLabel = input('Crear tarea');

  readonly save = output<TaskFormValue>();
  readonly cancelled = output<void>();

  readonly priorities = TASK_PRIORITIES;

  readonly parentTasks = computed(() => {
    const self = this.task()?.id;
    return self
      ? this.tasks().filter((task) => task.id !== self && task.parentTaskId !== self)
      : this.tasks();
  });

  readonly form = this.fb.group(
    {
      title: this.fb.nonNullable.control('', [Validators.required, Validators.pattern(NOT_BLANK)]),
      acceptanceCriteria: this.fb.nonNullable.control('', [
        Validators.required,
        Validators.pattern(NOT_BLANK),
      ]),
      parent: this.fb.nonNullable.control<ParentInstance | ''>('', Validators.required),
      description: this.fb.nonNullable.control(''),
      priority: this.fb.control<TaskPriority | null>(null),
      progressPercent: this.fb.control<number | null>(null, [
        Validators.min(0),
        Validators.max(100),
        Validators.pattern(/^\d+$/),
      ]),
      startDate: this.fb.nonNullable.control(''),
      estimatedDate: this.fb.nonNullable.control(''),
      dueDate: this.fb.nonNullable.control(''),
    },
    { validators: datesInOrder },
  );

  ngOnInit(): void {
    const task = this.task();
    if (task) {
      this.form.setValue({
        title: task.title,
        acceptanceCriteria: task.acceptanceCriteria ?? '',
        parent: parentInstanceOf(task),
        description: task.description ?? '',
        priority: task.priority,
        progressPercent: task.progressPercent,
        startDate: toDateInput(task.startDate),
        estimatedDate: toDateInput(task.estimatedDate),
        dueDate: toDateInput(task.dueDate),
      });
      if (!task.acceptanceCriteria) {
        // A document-sourced task may have none yet: it can be added, never cleared.
        this.form.controls.acceptanceCriteria.setValidators(Validators.pattern(NOT_BLANK));
        this.form.controls.acceptanceCriteria.updateValueAndValidity();
      }
    } else if (this.parentTaskId()) {
      this.form.controls.parent.setValue(`task:${this.parentTaskId()}`);
    }
    if (this.progressDerived()) {
      this.form.controls.progressPercent.disable();
    }
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.submitting()) {
      return;
    }
    const raw = this.form.getRawValue();
    const parentChanged = !this.task() || this.form.controls.parent.dirty;
    this.save.emit({
      title: raw.title.trim(),
      acceptanceCriteria: raw.acceptanceCriteria.trim(),
      description: raw.description.trim() || null,
      priority: raw.priority,
      ...(this.progressDerived() ? {} : { progressPercent: raw.progressPercent }),
      startDate: raw.startDate || null,
      estimatedDate: raw.estimatedDate || null,
      dueDate: raw.dueDate || null,
      ...(parentChanged
        ? linksFor(raw.parent as ParentInstance, this.hierarchy(), this.tasks())
        : {}),
    });
  }
}

/** Create payload: empty optional fields are simply not sent. */
export function toCreateTaskInput(value: TaskFormValue): CreateTaskInput {
  return withoutEmpty(value) as unknown as CreateTaskInput;
}

/** Update payload: `null` clears a field; acceptance criteria are never cleared, only left alone. */
export function toUpdateTaskInput(value: TaskFormValue): UpdateTaskInput {
  const { acceptanceCriteria, ...rest } = value;
  const input: Record<string, unknown> = { ...rest };
  if (acceptanceCriteria) {
    input['acceptanceCriteria'] = acceptanceCriteria;
  }
  return Object.fromEntries(
    Object.entries(input).filter(([, field]) => field !== undefined),
  ) as UpdateTaskInput;
}

/** Links implied by one parent instance, keeping the structure consistent: an epic brings its phase, a template its epic and phase, a subtask its parent's placement. */
export function linksFor(
  parent: ParentInstance,
  hierarchy: ProjectHierarchy,
  tasks: Task[],
): HierarchyLinks {
  const none: HierarchyLinks = {
    phaseId: null,
    epicId: null,
    templateId: null,
    parentTaskId: null,
  };
  const separator = parent.indexOf(':');
  const kind = parent.slice(0, separator);
  const id = parent.slice(separator + 1);
  const epicPhase = (epicId: string | null) =>
    hierarchy.epics.find((epic) => epic.id === epicId)?.phaseId ?? null;

  switch (kind) {
    case 'phase':
      return { ...none, phaseId: id };
    case 'epic':
      return { ...none, epicId: id, phaseId: epicPhase(id) };
    case 'template': {
      const epicId = hierarchy.templates.find((template) => template.id === id)?.epicId ?? null;
      return { ...none, templateId: id, epicId, phaseId: epicPhase(epicId) };
    }
    case 'task': {
      const parentTask = tasks.find((task) => task.id === id);
      return {
        phaseId: parentTask?.phaseId ?? null,
        epicId: parentTask?.epicId ?? null,
        templateId: parentTask?.templateId ?? null,
        parentTaskId: id,
      };
    }
    default:
      return none;
  }
}

function parentInstanceOf(task: Task): ParentInstance {
  if (task.parentTaskId) {
    return `task:${task.parentTaskId}`;
  }
  if (task.templateId) {
    return `template:${task.templateId}`;
  }
  if (task.epicId) {
    return `epic:${task.epicId}`;
  }
  return task.phaseId ? `phase:${task.phaseId}` : 'none';
}

function datesInOrder(group: AbstractControl): ValidationErrors | null {
  const { startDate, estimatedDate, dueDate } = group.value as Record<string, string>;
  if (!startDate) {
    return null;
  }
  const beforeStart = (date: string) => Boolean(date) && date < startDate;
  return beforeStart(estimatedDate) || beforeStart(dueDate) ? { datesOutOfOrder: true } : null;
}

/** An API timestamp as the `YYYY-MM-DD` a date input takes. */
function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

function withoutEmpty(value: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== null && field !== undefined),
  );
}
