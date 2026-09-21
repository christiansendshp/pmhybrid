import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { LabelPipe } from '../../shared/label.pipe.js';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { actorKindLabel } from '../../core/actor-kind.js';
import {
  BoardFilters,
  BoardGroupBy,
  BoardLane,
  BoardSortBy,
  NO_FILTERS,
  UNASSIGNED,
  filterCards,
  groupCards,
  isBlocked,
  sortCards,
} from '../../core/board.js';
import {
  BoardMemory,
  hasBoardParams,
  paramsToView,
  sameParams,
  viewToParams,
} from '../../core/board-query.js';
import {
  EMPTY_HIERARCHY,
  HierarchyService,
  ProjectHierarchy,
} from '../../core/hierarchy.service.js';
import { describeHttpError } from '../../core/http-error.js';
import { newIdempotencyKey } from '../../core/idempotency-key.js';
import { ProjectContext } from '../../core/project-context.js';
import { ProjectMember, ProjectsService } from '../../core/projects.service.js';
import { Viewport } from '../../core/viewport.js';
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
const TASK_WRITE = 'task.write';

/**
 * Cards a column shows before it offers the rest (Roadmap UX-02b). Finished work
 * piles up in the last column, and a column of a dozen cards was 2,900px tall.
 */
export const COLUMN_CAP = 8;

@Component({
  selector: 'app-kanban',
  imports: [
    LabelPipe,
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
  private readonly context = inject(ProjectContext);
  private readonly router = inject(Router);
  private readonly memory = inject(BoardMemory);
  readonly viewport = inject(Viewport);

  /** Creating a task needs `task.write`; the API enforces it regardless (Roadmap SECURITY-02). */
  readonly canWrite = computed(() => this.context.permissions().includes(TASK_WRITE));

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
  /** Names this create form's creation, so retrying it cannot make two (Roadmap BUG-07b). */
  private createKey = newIdempotencyKey();
  readonly createError = signal<string | null>(null);

  readonly filters = signal<BoardFilters>(NO_FILTERS);
  readonly groupBy = signal<BoardGroupBy>('none');
  readonly sortBy = signal<BoardSortBy>('created');

  /** On a phone the filters and the view are folded away until they are asked for; on a wide screen they are always there. */
  readonly toolbarOpen = signal(false);
  readonly showToolbar = computed(() => !this.viewport.compact() || this.toolbarOpen());

  /** The columns opened past the cap (their list ids). */
  readonly expanded = signal<ReadonlySet<string>>(new Set());

  readonly visibleCards = computed(() =>
    sortCards(filterCards(this.cards(), this.filters()), this.sortBy()),
  );

  /** Memoized — cdkDropList needs stable array references between change-detection runs. */
  readonly lanes = computed(() =>
    groupCards(this.visibleCards(), this.groupBy(), this.hierarchy()),
  );

  /** The cards each column shows: all of them once it is opened, else the first COLUMN_CAP. Memoized like `lanes`. */
  private readonly shown = computed(() => {
    const expanded = this.expanded();
    const shown = new Map<string, TaskCard[]>();
    for (const lane of this.lanes()) {
      for (const status of KANBAN_STATUSES) {
        const id = this.listId(lane.key, status);
        const cards = lane.columns[status];
        shown.set(id, expanded.has(id) ? cards : cards.slice(0, COLUMN_CAP));
      }
    }
    return shown;
  });

  readonly dropTargetIds = computed(() =>
    this.lanes().flatMap((lane) =>
      DROP_TARGET_STATUSES.map((status) => this.listId(lane.key, status)),
    ),
  );

  /** How many of the search, the filters and the view differ from a plain board, for the folded toolbar's label. */
  readonly changesCount = computed(() => Object.keys(this.viewParams()).length);

  private readonly viewParams = computed(() =>
    viewToParams({ filters: this.filters(), groupBy: this.groupBy(), sortBy: this.sortBy() }),
  );

  /** Set once the view has been read from the address: before that the defaults are not what the address says. */
  private viewRead = false;

  /** The address says what the board shows (Roadmap UX-02b): reloaded, shared, or come back to, it is the same board. */
  private readonly addressSync = effect(() => {
    const params = this.viewParams();
    if (!this.viewRead) {
      return;
    }
    this.memory.remember(this.projectId, params);
    if (!sameParams(params, this.route.snapshot.queryParams)) {
      // Replacing, not adding: a keystroke of the search is not a page to go back to.
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: params,
        replaceUrl: true,
      });
    }
  });

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
    this.readViewFromAddress();
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

  /** The view the address names; an address that names none gets the one this project's board was left with. */
  private readViewFromAddress(): void {
    const snapshot = this.route.snapshot;
    const address = snapshot?.queryParams ?? {};
    const view = hasBoardParams(address)
      ? paramsToView((key) => snapshot.queryParamMap.get(key))
      : paramsToView((key) => {
          const remembered = this.memory.recall(this.projectId)[key];
          return typeof remembered === 'string' ? remembered : null;
        });
    this.filters.set(view.filters);
    this.groupBy.set(view.groupBy);
    this.sortBy.set(view.sortBy);
    this.viewRead = true;
  }

  listId(laneKey: string, status: TaskStatus): string {
    return `lane-${laneKey}-${status}`;
  }

  shownIn(lane: BoardLane, status: TaskStatus): TaskCard[] {
    return this.shown().get(this.listId(lane.key, status)) ?? [];
  }

  hiddenIn(lane: BoardLane, status: TaskStatus): number {
    return lane.columns[status].length - this.shownIn(lane, status).length;
  }

  /** An opened column that is longer than the cap can be closed again. */
  canCollapse(lane: BoardLane, status: TaskStatus): boolean {
    return (
      this.expanded().has(this.listId(lane.key, status)) && lane.columns[status].length > COLUMN_CAP
    );
  }

  expandColumn(id: string): void {
    this.expanded.update((expanded) => new Set(expanded).add(id));
  }

  collapseColumn(id: string): void {
    this.expanded.update((expanded) => {
      const next = new Set(expanded);
      next.delete(id);
      return next;
    });
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
    // Open the column it lands in: sorted past the cap it would seem to have vanished.
    if (event.container.id) {
      this.expandColumn(event.container.id);
    }
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
    this.createKey = newIdempotencyKey();
    this.showCreateForm.set(true);
  }

  async create(value: TaskFormValue): Promise<void> {
    if (this.creating()) {
      return;
    }
    this.creating.set(true);
    this.createError.set(null);
    try {
      // The same key on every retry of this form: a request that timed out
      // after the server made the task cannot make a second one.
      await this.tasksService.create(this.projectId, toCreateTaskInput(value), this.createKey);
      this.createKey = newIdempotencyKey();
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
