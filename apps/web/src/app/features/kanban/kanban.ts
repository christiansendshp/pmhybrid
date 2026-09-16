import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { actorKindLabel } from '../../core/actor-kind.js';
import {
  BoardFilters,
  BoardGroupBy,
  BoardSortBy,
  NO_FILTERS,
  UNASSIGNED,
  filterCards,
  groupCards,
  isBlocked,
  sortCards,
} from '../../core/board.js';
import {
  EMPTY_HIERARCHY,
  HierarchyService,
  ProjectHierarchy,
} from '../../core/hierarchy.service.js';
import { describeHttpError } from '../../core/http-error.js';
import { ProjectMember, ProjectsService } from '../../core/projects.service.js';
import {
  KANBAN_STATUSES,
  isDraggableTransition,
  statusLabel,
} from '../../core/task-status-policy.js';
import { TASK_PRIORITIES, TaskCard, TaskStatus, TasksService } from '../../core/tasks.service.js';
import { TaskForm, TaskFormValue, toCreateTaskInput } from '../../shared/task-form/task-form.js';

/** Columns a card can be dropped on — see core/task-status-policy.ts isDraggableTransition. */
const DROP_TARGET_STATUSES = KANBAN_STATUSES.filter(
  (status) => status !== 'PENDIENTE' && status !== 'ASIGNADA',
);

/**
 * Brief §15 Kanban: five columns, cards carrying every field the brief lists,
 * search, filters, swimlane grouping and in-column sorting. Drag & drop only
 * accepts a legal transition; the API still checks the transition and the
 * requester's permission.
 */
@Component({
  selector: 'app-kanban',
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    RouterLink,
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    TaskForm,
  ],
  templateUrl: './kanban.html',
  styleUrl: './kanban.scss',
})
export class Kanban implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly tasksService = inject(TasksService);
  private readonly projectsService = inject(ProjectsService);
  private readonly hierarchyService = inject(HierarchyService);

  readonly statuses = KANBAN_STATUSES;
  readonly priorities = TASK_PRIORITIES;
  readonly unassigned = UNASSIGNED;
  readonly kindLabel = actorKindLabel;
  readonly isBlocked = isBlocked;

  readonly cards = signal<TaskCard[]>([]);
  readonly members = signal<ProjectMember[]>([]);
  readonly hierarchy = signal<ProjectHierarchy>(EMPTY_HIERARCHY);
  readonly loading = signal(true);
  readonly boardError = signal<string | null>(null);
  readonly showCreateForm = signal(false);
  readonly creating = signal(false);
  readonly createError = signal<string | null>(null);

  readonly filters = signal<BoardFilters>(NO_FILTERS);
  readonly groupBy = signal<BoardGroupBy>('none');
  readonly sortBy = signal<BoardSortBy>('created');

  readonly visibleCards = computed(() =>
    sortCards(filterCards(this.cards(), this.filters()), this.sortBy()),
  );

  /** Memoized — cdkDropList needs stable array references between change-detection runs. */
  readonly lanes = computed(() =>
    groupCards(this.visibleCards(), this.groupBy(), this.hierarchy()),
  );

  readonly dropTargetIds = computed(() =>
    this.lanes().flatMap((lane) =>
      DROP_TARGET_STATUSES.map((status) => this.listId(lane.key, status)),
    ),
  );

  readonly filtersActive = computed(() => {
    const filters = this.filters();
    return (
      filters.search.trim() !== '' ||
      filters.assigneeId !== null ||
      filters.priority !== null ||
      filters.phaseId !== null ||
      filters.epicId !== null ||
      filters.blockedOnly
    );
  });

  /** One stable predicate per column, so a card only enters a column it may legally move to. */
  readonly canEnter = Object.fromEntries(
    KANBAN_STATUSES.map((status) => [
      status,
      (drag: CdkDrag<TaskCard>) => isDraggableTransition(drag.data.status, status),
    ]),
  ) as Record<TaskStatus, (drag: CdkDrag<TaskCard>) => boolean>;

  private get projectId(): string {
    return this.route.parent!.snapshot.paramMap.get('projectId')!;
  }

  async ngOnInit(): Promise<void> {
    try {
      const [cards, members, hierarchy] = await Promise.all([
        this.tasksService.listForProject(this.projectId),
        this.projectsService.listMembers(this.projectId),
        this.hierarchyService.load(this.projectId),
      ]);
      this.cards.set(cards);
      this.members.set(members);
      this.hierarchy.set(hierarchy);
    } catch (error) {
      this.boardError.set(describeHttpError(error, 'No se pudo cargar el tablero.'));
    } finally {
      this.loading.set(false);
    }
  }

  listId(laneKey: string, status: TaskStatus): string {
    return `lane-${laneKey}-${status}`;
  }

  readonly statusLabel = statusLabel;

  patchFilters(patch: Partial<BoardFilters>): void {
    this.filters.update((filters) => ({ ...filters, ...patch }));
  }

  clearFilters(): void {
    this.filters.set(NO_FILTERS);
  }

  /** Phase › Epic, by name. */
  placementOf(card: TaskCard): string {
    const { phases, epics } = this.hierarchy();
    return [
      phases.find((phase) => phase.id === card.phaseId)?.name,
      epics.find((epic) => epic.id === card.epicId)?.name,
    ]
      .filter(Boolean)
      .join(' › ');
  }

  /** The date a card shows: due, else estimated; overdue once past and not finished. */
  dateOf(card: TaskCard): { label: string; value: string; overdue: boolean } | null {
    const value = card.dueDate ?? card.estimatedDate;
    if (!value) {
      return null;
    }
    const overdue =
      card.dueDate !== null &&
      card.status !== 'TERMINADA' &&
      new Date(card.dueDate).getTime() < Date.now();
    return {
      label: overdue ? 'Vencida' : card.dueDate ? 'Vence' : 'Estimada',
      value,
      overdue,
    };
  }

  async onDrop(event: CdkDragDrop<TaskCard[]>, toStatus: TaskStatus): Promise<void> {
    const card = event.item.data as TaskCard;
    if (
      event.previousContainer === event.container ||
      !isDraggableTransition(card.status, toStatus)
    ) {
      return;
    }
    this.boardError.set(null);
    // Move the card right away; the reload below settles it either way.
    this.cards.update((cards) =>
      cards.map((existing) =>
        existing.id === card.id ? { ...existing, status: toStatus } : existing,
      ),
    );
    try {
      await this.tasksService.transition(this.projectId, card.id, toStatus);
    } catch (error) {
      this.boardError.set(describeHttpError(error, 'No se pudo mover la tarea.'));
    }
    await this.reloadCards();
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
      await this.reloadCards();
    } catch (error) {
      this.createError.set(describeHttpError(error, 'No se pudo crear la tarea.'));
    } finally {
      this.creating.set(false);
    }
  }

  private async reloadCards(): Promise<void> {
    try {
      this.cards.set(await this.tasksService.listForProject(this.projectId));
    } catch (error) {
      this.boardError.set(describeHttpError(error, 'No se pudo actualizar el tablero.'));
    }
  }
}
