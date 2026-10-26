import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { LabelPipe } from '../../shared/label.pipe.js';
import { ShortTitlePipe } from '../../shared/short-title.pipe.js';
import { BoardViews } from '../../shared/board-views/board-views.js';
import { TaskTable } from '../task-table/task-table.js';
import { ReviewQueue } from '../review-queue/review-queue.js';
import { NoteDialog } from '../../shared/note-dialog/note-dialog.js';
import { RisksService, type ProjectRisks } from '../../core/risks.service.js';
import { DependenciesView } from '../dependencies/dependencies.js';
import { WaitingView } from '../waiting/waiting.js';
import { WaitingService, type Waiting } from '../../core/waiting.service.js';
import { AgentLanes } from '../agent-lanes/agent-lanes.js';
import { Timeline } from '../timeline/timeline.js';
import type { LedgerSpans } from '../../core/timeline.js';
import type { UnregisteredName } from '../../core/agent-lanes.js';
import { SynchronizationService } from '../../core/synchronization.service.js';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
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
  DEFAULT_GROUP,
  DEFAULT_LIST,
  DEFAULT_SORT,
  ListState,
  hasBoardParams,
  listToParams,
  paramsToList,
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
import { ledgerDivergenceText, ledgerDiverges } from '../../core/ledger-stage.js';
import { ProjectContext } from '../../core/project-context.js';
import { elapsedText, stageAgeText } from '../../core/stage-age.js';
import { WipState, countAgentWip, countInStatus, wipRatio, wipState } from '../../core/wip.js';
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
const MEMBERS_MANAGE = 'project.members.manage';
const ACTORS_MANAGE = 'actors.manage';

/**
 * Cards a column shows before it offers the rest (Roadmap UX-02b). Finished work
 * piles up in the last column, and a column of a dozen cards was 2,900px tall.
 */
export const COLUMN_CAP = 8;

@Component({
  selector: 'app-kanban',
  imports: [
    WaitingView,
    DependenciesView,
    LabelPipe,
    ShortTitlePipe,
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
    BoardViews,
    TaskTable,
    ReviewQueue,
    AgentLanes,
    Timeline,
  ],
  templateUrl: './kanban.html',
  styleUrl: './kanban.scss',
})
export class Kanban implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly tasksService = inject(TasksService);
  private readonly projectsService = inject(ProjectsService);
  private readonly synchronization = inject(SynchronizationService);
  private readonly hierarchyService = inject(HierarchyService);
  private readonly context = inject(ProjectContext);
  private readonly router = inject(Router);
  private readonly memory = inject(BoardMemory);
  private readonly dialog = inject(MatDialog);
  private readonly waitingService = inject(WaitingService);
  private readonly risksService = inject(RisksService);
  readonly viewport = inject(Viewport);

  /**
   * Which of the views of the tasks this page shows (Roadmap TASK-17, TASK-18): the board, or the list
   * the route `list` names. They share the filters, their toolbar and their address; each has its own body.
   */
  readonly view = signal<
    'board' | 'list' | 'review' | 'agents' | 'waiting' | 'dependencies' | 'timeline'
  >('board');
  /** The risks of the project, for the view of what blocks what and the critical path (Roadmap TASK-22). */
  readonly risks = signal<ProjectRisks | null>(null);
  readonly risksFailed = signal(false);
  /** What the project waits for, for the view that lists it (Roadmap TASK-21). */
  readonly waitingList = signal<Waiting | null>(null);
  readonly waitingFailed = signal(false);
  /** When the ledger says each task was first started and last closed, for the timeline (Roadmap TASK-23). */
  readonly spans = signal<LedgerSpans>({});
  readonly spansFailed = signal(false);
  /** The project's threshold for an instant close, as the timeline's legend says it. */
  readonly instantMinutes = computed(() => this.context.project()?.instantCloseMinutes ?? 5);
  /** The names the documents carry that no registered agent answers to, for the view by agent (Roadmap TASK-20). */
  readonly unregistered = signal<UnregisteredName[]>([]);
  readonly unregisteredFailed = signal(false);
  /** Registering a name takes the permission to manage the members and the one to create agents (Roadmap TASK-03). */
  readonly canRegisterAgents = computed(() => {
    const permissions = this.context.permissions();
    return permissions.includes(MEMBERS_MANAGE) && permissions.includes(ACTORS_MANAGE);
  });
  readonly registeringName = signal<string | null>(null);
  readonly registerError = signal<string | null>(null);
  /** The limit of work in development per agent, for the lanes of the view by agent. */
  readonly wipAgentLimit = computed(() => this.context.project()?.wipLimitAgent ?? null);
  /** How the list is ordered and which page it is on; only the list has them. */
  readonly list = signal<ListState>(DEFAULT_LIST);
  /** How many tasks the filters keep, as the list last read it. */
  readonly listTotal = signal(0);
  /** Bumped when something changes the tasks, so the list reads its page again. */
  readonly listVersion = signal(0);

  /** Creating a task needs `task.write`; the API enforces it regardless (Roadmap SECURITY-02). */
  readonly canWrite = computed(() => this.context.permissions().includes(TASK_WRITE));

  readonly statuses = KANBAN_STATUSES;
  /** How long without a move makes a task stale, as the filter offers it (Roadmap TASK-16). */
  readonly staleOptions = [
    { hours: 24, label: 'Más de 1 día' },
    { hours: 72, label: 'Más de 3 días' },
    { hours: 168, label: 'Más de 7 días' },
    { hours: 720, label: 'Más de 30 días' },
  ] as const;
  readonly priorities = TASK_PRIORITIES;
  readonly unassigned = UNASSIGNED;
  readonly kindLabel = actorKindLabel;
  readonly isBlocked = isBlocked;
  readonly ledgerDiverges = ledgerDiverges;
  readonly divergenceText = ledgerDivergenceText;
  readonly stageAge = (card: TaskCard) => stageAgeText(card.status, card.statusChangedAt);
  readonly wipRatio = wipRatio;

  /** What the last move into a column said about its limit, so a move that fills it past the limit is never silent (Roadmap TASK-15). */
  readonly wipNotice = signal<string | null>(null);

  /**
   * How a column stands against its advisory limit: the project's whole count in the status, not what the
   * filters leave. Only the board without swimlanes has whole columns to say it on.
   */
  columnWip(status: TaskStatus): WipState | null {
    const project = this.context.project();
    const limit =
      status === 'EN_DESARROLLO'
        ? project?.wipLimitDevelopment
        : status === 'QA'
          ? project?.wipLimitQa
          : null;
    return this.groupBy() === 'none' ? wipState(countInStatus(this.cards(), status), limit) : null;
  }

  /** How an agent stands against the limit of work in development per agent: on its lane, when the board is grouped by assignee. */
  agentWip(laneKey: string): WipState | null {
    const limit = this.context.project()?.wipLimitAgent;
    const isAgent = this.cards().some(
      (card) => card.assignee?.id === laneKey && card.assignee.kind === 'AI_AGENT',
    );
    return this.groupBy() === 'assignee' && isAgent
      ? wipState(countAgentWip(this.cards(), laneKey), limit)
      : null;
  }

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

  /** What a view hands to the next: the filters, never what only one view has. */
  readonly carriedParams = computed(() =>
    viewToParams({ filters: this.filters(), groupBy: DEFAULT_GROUP, sortBy: DEFAULT_SORT }),
  );

  private readonly viewParams = computed(() =>
    this.view() === 'board'
      ? viewToParams({ filters: this.filters(), groupBy: this.groupBy(), sortBy: this.sortBy() })
      : {
          ...this.carriedParams(),
          ...(this.view() === 'list' ? listToParams(this.list()) : {}),
        },
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
      filters.blockedOnly ||
      filters.staleHours !== null ||
      filters.assigneeKind !== null ||
      filters.reviewerId !== null ||
      filters.divergentOnly ||
      filters.instantCloseOnly
    );
  });

  /** One stable predicate per column, so a card only enters a column it may legally move to. */
  readonly canEnter = Object.fromEntries(
    KANBAN_STATUSES.map((status) => [
      status,
      (drag: CdkDrag<TaskCard>) => isDraggableTransition(drag.data.status, status),
    ]),
  ) as Record<TaskStatus, (drag: CdkDrag<TaskCard>) => boolean>;

  /** The project this page shows, for the list to read from. */
  get projectId(): string {
    return this.route.parent!.snapshot.paramMap.get('projectId')!;
  }

  async ngOnInit(): Promise<void> {
    const named = this.route.snapshot?.data?.['view'];
    this.view.set(
      named === 'list' ||
        named === 'review' ||
        named === 'agents' ||
        named === 'waiting' ||
        named === 'dependencies' ||
        named === 'timeline'
        ? named
        : 'board',
    );
    this.readViewFromAddress();
    try {
      // The list reads its own page, so it does not load every task to show the first one.
      const [cards, members, hierarchy] = await Promise.all([
        this.view() === 'list' ? Promise.resolve([]) : this.fetchCards(),
        this.projectsService.listMembers(this.projectId),
        this.hierarchyService.load(this.projectId),
      ]);
      this.cards.set(cards);
      this.members.set(members);
      this.hierarchy.set(hierarchy);
      if (this.view() === 'agents') {
        await this.readUnregistered();
      }
      if (this.view() === 'waiting') {
        await this.readWaiting();
      }
      if (this.view() === 'dependencies') {
        await this.readRisks();
      }
      if (this.view() === 'timeline') {
        await this.readSpans();
      }
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
    if (this.view() === 'list') {
      this.list.set(
        hasBoardParams(address)
          ? paramsToList((key) => snapshot.queryParamMap.get(key))
          : paramsToList((key) => {
              const remembered = this.memory.recall(this.projectId)[key];
              return typeof remembered === 'string' ? remembered : null;
            }),
      );
    }
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
    this.firstPage();
  }

  /** Another set of tasks starts at the first page of the list. */
  private firstPage(): void {
    if (this.list().page !== 1) {
      this.list.update((list) => ({ ...list, page: 1 }));
    }
  }

  onListSort(change: { sort: ListState['sort']; dir: ListState['dir'] }): void {
    this.list.update((list) => ({ ...list, ...change, page: 1 }));
  }

  onListPage(page: number): void {
    this.list.update((list) => ({ ...list, page }));
  }

  clearFilters(): void {
    this.filters.set(NO_FILTERS);
    this.firstPage();
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

  /** How long a blocked card has been blocked ("hace 3 d"), or null when the task does not say since when (Roadmap TASK-31). */
  blockedFor(card: TaskCard): string | null {
    return card.blockedSince ? elapsedText(card.blockedSince) : null;
  }

  async onDrop(event: CdkDragDrop<TaskCard[]>, toStatus: TaskStatus): Promise<void> {
    const card = event.item.data as TaskCard;
    if (
      event.previousContainer === event.container ||
      !isDraggableTransition(card.status, toStatus)
    ) {
      return;
    }
    // A task sent back from QA says why, if the person wants to; cancelling leaves it where it was (Roadmap TASK-28).
    let reason = '';
    if (card.status === 'QA' && toStatus === 'EN_DESARROLLO') {
      const answer = await this.askReturnReason(card);
      if (answer === undefined) {
        return;
      }
      reason = answer;
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
      await (reason
        ? this.tasksService.transition(this.projectId, card.id, toStatus, null, reason)
        : this.tasksService.transition(this.projectId, card.id, toStatus));
    } catch (error) {
      this.boardError.set(describeHttpError(error, 'No se pudo mover la tarea.'));
    }
    await this.reloadCards();
    this.sayIfOverLimit(toStatus);
  }

  /** The reason a task goes back to development, or `undefined` when the person cancels. */
  private askReturnReason(card: TaskCard): Promise<string | undefined> {
    const dialogRef = this.dialog.open<NoteDialog, unknown, string | undefined>(NoteDialog, {
      data: {
        title: 'Devolver a desarrollo',
        label: `Motivo (opcional) — ${card.title}`,
        confirm: 'Devolver',
        hint: 'Se guarda con el cambio y se escribe en el registro del proyecto si lo lleva.',
      },
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  /** A move into a full column goes through, and says that the column is now past its limit. */
  private sayIfOverLimit(status: TaskStatus): void {
    const wip = status === 'EN_DESARROLLO' || status === 'QA' ? this.columnWip(status) : null;
    this.wipNotice.set(
      wip?.exceeded
        ? `${statusLabel(status)} queda en ${wipRatio(wip)}: excedido. El límite avisa, no impide mover tareas.`
        : null,
    );
  }

  openCreateForm(): void {
    // The list did not load every task, and the form offers them as the ones a new task can depend on.
    if (this.view() === 'list' && this.cards().length === 0) {
      void this.reloadCards();
    }
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

  /** The names no agent answers to; a list that cannot be read leaves the lanes as they are and says so. */
  /** The ids of the tasks the filters keep, or null while none is on, so the list of what is waiting leaves nothing out. */
  readonly visibleTaskIds = computed(() =>
    this.visibleCards().length === this.cards().length
      ? null
      : new Set(this.visibleCards().map((card) => card.id)),
  );

  /** What the project waits for; one that cannot be read is said in the view, not left empty (Roadmap TASK-21). */
  private async readWaiting(): Promise<void> {
    try {
      this.waitingList.set(await this.waitingService.get(this.projectId));
      this.waitingFailed.set(false);
    } catch {
      this.waitingFailed.set(true);
    }
  }

  /** Registers a name the ledger carries as an agent of the project, then reads the lanes again (Roadmap TASK-03). */
  async registerAgent(name: string): Promise<void> {
    this.registeringName.set(name);
    this.registerError.set(null);
    try {
      await this.projectsService.registerLedgerAgent(this.projectId, name);
      // The agent is a member now and its entries answer to it: the lanes, the names and the cards change.
      this.members.set(await this.projectsService.listMembers(this.projectId));
      await this.readUnregistered();
      await this.reloadCards();
    } catch (error) {
      this.registerError.set(describeHttpError(error, 'No se pudo registrar el agente.'));
    } finally {
      this.registeringName.set(null);
    }
  }

  private async readUnregistered(): Promise<void> {
    try {
      this.unregistered.set(
        (await this.synchronization.unresolvedNames(this.projectId)).ledgerNames,
      );
      this.unregisteredFailed.set(false);
    } catch {
      this.unregisteredFailed.set(true);
    }
  }

  /** The ledger's spans; one that cannot be read leaves the timeline on the dates of the tasks, and says so. */
  private async readRisks(): Promise<void> {
    try {
      this.risks.set(await this.risksService.get(this.projectId));
    } catch {
      this.risksFailed.set(true);
    }
  }

  private async readSpans(): Promise<void> {
    try {
      this.spans.set(await this.tasksService.spans(this.projectId));
    } catch {
      this.spansFailed.set(true);
    }
  }

  /** The tasks this view needs: all of them, or only those in QA for the queue of reviews. */
  private fetchCards(): Promise<TaskCard[]> {
    return this.tasksService.listForProject(
      this.projectId,
      this.view() === 'review' ? { status: 'QA' } : {},
    );
  }

  /** A review was approved or rejected: the queue is read again. */
  onReviewed(): void {
    void this.reloadCards();
  }

  private async reloadCards(): Promise<void> {
    this.listVersion.update((version) => version + 1);
    try {
      this.cards.set(await this.fetchCards());
    } catch (error) {
      this.boardError.set(describeHttpError(error, 'No se pudo actualizar el tablero.'));
    }
  }
}
