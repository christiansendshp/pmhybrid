import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { actorKindLabel } from '../../core/actor-kind.js';
import { BoardFilters } from '../../core/board.js';
import { ListState, filtersToTableQuery } from '../../core/board-query.js';
import { describeHttpError } from '../../core/http-error.js';
import { ledgerDivergenceText, ledgerDiverges } from '../../core/ledger-stage.js';
import { elapsedText } from '../../core/stage-age.js';
import { statusLabel } from '../../core/task-status-policy.js';
import { TaskCard, TaskTableSort, TasksService } from '../../core/tasks.service.js';
import { LabelPipe } from '../../shared/label.pipe.js';
import { ShortTitlePipe } from '../../shared/short-title.pipe.js';

/** How many tasks a page of the table holds (Roadmap TASK-18). */
export const TABLE_PAGE_SIZE = 50;

interface Column {
  key: TaskTableSort;
  label: string;
}

/**
 * The tasks of the project as a table (Roadmap TASK-18). It asks the server for one page at a time,
 * filtered like the board and ordered by the column the person chose, so the order is the same on every
 * page and a project of any size shows its first page without loading the rest. It keeps no state of its
 * own about what is asked: the filters, the order and the page come from the address, through the page
 * that holds it, and a change is handed back to it.
 */
@Component({
  selector: 'app-task-table',
  imports: [DatePipe, LabelPipe, RouterLink, ShortTitlePipe, MatButtonModule],
  templateUrl: './task-table.html',
  styleUrl: './task-table.scss',
})
export class TaskTable {
  private readonly tasksService = inject(TasksService);

  readonly projectId = input.required<string>();
  readonly filters = input.required<BoardFilters>();
  readonly list = input.required<ListState>();
  /** Changes when the tasks changed somewhere else, so the page is read again. */
  readonly reloadToken = input(0);

  readonly sortChange = output<{ sort: TaskTableSort; dir: 'asc' | 'desc' }>();
  readonly pageChange = output<number>();
  /** How many tasks the filters keep, whenever a page is read. */
  readonly totalChange = output<number>();

  readonly columns: readonly Column[] = [
    { key: 'externalId', label: 'ID' },
    { key: 'title', label: 'Título' },
    { key: 'status', label: 'Estado' },
    { key: 'assignee', label: 'Responsable' },
    { key: 'reviewer', label: 'Revisor' },
    { key: 'priority', label: 'Prioridad' },
    { key: 'age', label: 'En la etapa' },
    { key: 'dueDate', label: 'Vence' },
    { key: 'updatedAt', label: 'Actualizada' },
  ];

  readonly rows = signal<TaskCard[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly statusLabel = statusLabel;
  readonly kindLabel = actorKindLabel;
  readonly ledgerDiverges = ledgerDiverges;
  readonly divergenceText = ledgerDivergenceText;
  readonly elapsed = (card: TaskCard) =>
    card.status === 'TERMINADA' ? '—' : elapsedText(card.statusChangedAt);

  readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / TABLE_PAGE_SIZE)));
  readonly firstShown = computed(() =>
    this.total() === 0 ? 0 : (this.list().page - 1) * TABLE_PAGE_SIZE + 1,
  );
  readonly lastShown = computed(
    () => this.firstShown() + this.rows().length - (this.rows().length > 0 ? 1 : 0),
  );

  /** Only the answer to the latest question counts: a slow one that was asked before must not replace it. */
  private asked = 0;

  /** Asks again whenever the filters, the order or the page change. */
  private readonly reload = effect(() => {
    const list = this.list();
    this.reloadToken();
    const query = {
      ...filtersToTableQuery(this.filters()),
      sort: list.sort,
      dir: list.dir,
      limit: TABLE_PAGE_SIZE,
      offset: (list.page - 1) * TABLE_PAGE_SIZE,
    };
    void this.read(this.projectId(), query, list.page);
  });

  private async read(
    projectId: string,
    query: Parameters<TasksService['table']>[1],
    page: number,
  ): Promise<void> {
    const ask = ++this.asked;
    this.loading.set(true);
    try {
      const answer = await this.tasksService.table(projectId, query);
      if (ask !== this.asked) {
        return;
      }
      this.error.set(null);
      this.rows.set(answer.items);
      this.total.set(answer.total);
      this.totalChange.emit(answer.total);
      // The filters now keep fewer tasks than this page starts at: go to the last page there is.
      const last = Math.max(1, Math.ceil(answer.total / TABLE_PAGE_SIZE));
      if (answer.items.length === 0 && page > last) {
        this.pageChange.emit(last);
      }
    } catch (error) {
      if (ask === this.asked) {
        this.error.set(describeHttpError(error, 'No se pudo cargar la lista.'));
      }
    } finally {
      if (ask === this.asked) {
        this.loading.set(false);
      }
    }
  }

  /** What a header says about the order, for a screen reader and for the person. */
  ariaSort(key: TaskTableSort): 'ascending' | 'descending' | 'none' {
    const list = this.list();
    return list.sort === key ? (list.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  /** The same column again turns the order around; another column starts ascending. */
  sortBy(key: TaskTableSort): void {
    const list = this.list();
    this.sortChange.emit({
      sort: key,
      dir: list.sort === key && list.dir === 'asc' ? 'desc' : 'asc',
    });
  }

  goTo(page: number): void {
    if (page >= 1 && page <= this.pages() && page !== this.list().page) {
      this.pageChange.emit(page);
    }
  }

  /** The date of a card, as the board writes it: due, else estimated; nothing when it has neither. */
  dateOf(card: TaskCard): string | null {
    return card.dueDate ?? card.estimatedDate;
  }
}
