import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  CdkDropListGroup,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ProjectMember, ProjectsService } from '../../core/projects.service.js';
import { KANBAN_STATUSES, isDraggableTransition } from '../../core/task-status-policy.js';
import { Task, TaskStatus, TasksService } from '../../core/tasks.service.js';

/**
 * FASE-09. Drag & drop moves a card between columns via
 * POST .../transition. PENDIENTE and ASIGNADA are not drop targets — see
 * core/task-status-policy.ts's isDraggableTransition docstring for why.
 */
@Component({
  selector: 'app-kanban',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    RouterLink,
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './kanban.html',
})
export class Kanban implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly tasksService = inject(TasksService);
  private readonly projectsService = inject(ProjectsService);
  private readonly fb = inject(FormBuilder);

  readonly statuses = KANBAN_STATUSES;
  readonly allTasks = signal<Task[]>([]);
  readonly members = signal<ProjectMember[]>([]);
  readonly showCreateForm = signal(false);
  readonly creating = signal(false);

  readonly assigneeFilter = signal<string | null>(null);
  readonly titleFilter = signal('');

  readonly filteredTasks = computed(() => {
    const assignee = this.assigneeFilter();
    const title = this.titleFilter().trim().toLowerCase();
    return this.allTasks().filter((task) => {
      if (assignee && task.assigneeActorId !== assignee) {
        return false;
      }
      if (title && !task.title.toLowerCase().includes(title)) {
        return false;
      }
      return true;
    });
  });

  /** Memoized per status — a plain per-render filter would hand cdkDropList a fresh array reference every change-detection tick, which corrupts in-flight drag index tracking. */
  readonly tasksByStatus = computed(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      PENDIENTE: [],
      ASIGNADA: [],
      EN_DESARROLLO: [],
      QA: [],
      TERMINADA: [],
    };
    for (const task of this.filteredTasks()) {
      grouped[task.status].push(task);
    }
    return grouped;
  });

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required]],
  });

  private get projectId(): string {
    return this.route.parent!.snapshot.paramMap.get('projectId')!;
  }

  async ngOnInit(): Promise<void> {
    const [tasks, members] = await Promise.all([
      this.tasksService.listForProject(this.projectId),
      this.projectsService.listMembers(this.projectId),
    ]);
    this.allTasks.set(tasks);
    this.members.set(members);
  }

  /** Drop targets: PENDIENTE and ASIGNADA columns are excluded entirely (see class docstring). */
  connectedListsFor(status: TaskStatus): string[] {
    if (status === 'PENDIENTE' || status === 'ASIGNADA') {
      return [];
    }
    return this.statuses.map((s) => `column-${s}`);
  }

  async onDrop(event: CdkDragDrop<Task[]>, toStatus: TaskStatus): Promise<void> {
    const task = event.item.data as Task;
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      return;
    }
    if (!isDraggableTransition(task.status, toStatus)) {
      return; // illegal target — leave the card in its original column
    }

    transferArrayItem(
      event.previousContainer.data,
      event.container.data,
      event.previousIndex,
      event.currentIndex,
    );

    try {
      await this.tasksService.transition(this.projectId, task.id, toStatus);
    } finally {
      this.allTasks.set(await this.tasksService.listForProject(this.projectId));
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.creating()) {
      return;
    }
    this.creating.set(true);
    try {
      await this.tasksService.create(this.projectId, { title: this.form.getRawValue().title });
      this.form.reset();
      this.showCreateForm.set(false);
      this.allTasks.set(await this.tasksService.listForProject(this.projectId));
    } finally {
      this.creating.set(false);
    }
  }
}
