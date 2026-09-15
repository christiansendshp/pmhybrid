import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  CdkDropListGroup,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import {
  EMPTY_HIERARCHY,
  HierarchyService,
  ProjectHierarchy,
} from '../../core/hierarchy.service.js';
import { describeHttpError } from '../../core/http-error.js';
import { ProjectMember, ProjectsService } from '../../core/projects.service.js';
import { KANBAN_STATUSES, isDraggableTransition } from '../../core/task-status-policy.js';
import { Task, TaskStatus, TasksService } from '../../core/tasks.service.js';
import { TaskForm, TaskFormValue, toCreateTaskInput } from '../../shared/task-form/task-form.js';

/**
 * FASE-09. Drag & drop moves a card between columns via
 * POST .../transition. PENDIENTE and ASIGNADA are not drop targets — see
 * core/task-status-policy.ts's isDraggableTransition docstring for why.
 */
@Component({
  selector: 'app-kanban',
  imports: [
    FormsModule,
    RouterLink,
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    MatButtonModule,
    MatSelectModule,
    TaskForm,
  ],
  templateUrl: './kanban.html',
})
export class Kanban implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly tasksService = inject(TasksService);
  private readonly projectsService = inject(ProjectsService);
  private readonly hierarchyService = inject(HierarchyService);

  readonly statuses = KANBAN_STATUSES;
  readonly allTasks = signal<Task[]>([]);
  readonly members = signal<ProjectMember[]>([]);
  readonly hierarchy = signal<ProjectHierarchy>(EMPTY_HIERARCHY);
  readonly showCreateForm = signal(false);
  readonly creating = signal(false);
  readonly createError = signal<string | null>(null);

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

  private get projectId(): string {
    return this.route.parent!.snapshot.paramMap.get('projectId')!;
  }

  async ngOnInit(): Promise<void> {
    const [tasks, members, hierarchy] = await Promise.all([
      this.tasksService.listForProject(this.projectId),
      this.projectsService.listMembers(this.projectId),
      this.hierarchyService.load(this.projectId),
    ]);
    this.allTasks.set(tasks);
    this.members.set(members);
    this.hierarchy.set(hierarchy);
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

  openCreateForm(): void {
    this.createError.set(null);
    this.showCreateForm.set(true);
  }

  async create(value: TaskFormValue): Promise<void> {
    if (this.creating()) {
      return;
    }
    this.creating.set(true);
    this.createError.set(null);
    try {
      await this.tasksService.create(this.projectId, toCreateTaskInput(value));
      this.showCreateForm.set(false);
      this.allTasks.set(await this.tasksService.listForProject(this.projectId));
    } catch (error) {
      this.createError.set(describeHttpError(error, 'The task could not be created.'));
    } finally {
      this.creating.set(false);
    }
  }
}
