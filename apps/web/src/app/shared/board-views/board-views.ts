import { Component, input } from '@angular/core';
import type { Params } from '@angular/router';
import { RouterLink, RouterLinkActive } from '@angular/router';

/** A way to look at the tasks of a project (Roadmap TASK-17): the path of its route, and its name. */
export interface BoardViewLink {
  path: string;
  label: string;
}

/**
 * The views that exist, in the order they are offered. A view is listed when it ships, not before:
 * a link to something that is not there is worse than no link. `kanban` stays the address of the board.
 */
export const BOARD_VIEWS: readonly BoardViewLink[] = [
  { path: 'kanban', label: 'Tablero' },
  { path: 'list', label: 'Lista' },
  { path: 'review', label: 'En revisión' },
  { path: 'agents', label: 'Por agente' },
  { path: 'waiting', label: 'Esperando' },
  { path: 'timeline', label: 'Línea de tiempo' },
];

/**
 * The switcher between the views of a project's tasks (Roadmap TASK-17). Every link carries the filters
 * of the view being left, in the address, so the next view shows the same tasks; what only one view has
 * (the board's grouping and order, the list's order and page) is not carried. A view that cannot use a
 * filter that is on says so in words, so the difference between two views is never a silent one.
 */
@Component({
  selector: 'app-board-views',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="board-views" aria-label="Vistas del tablero">
      <ul class="board-views__list">
        @for (view of views; track view.path) {
          <li>
            <a
              class="board-views__link"
              [routerLink]="['..', view.path]"
              [queryParams]="params()"
              routerLinkActive="board-views__link--active"
              ariaCurrentWhenActive="page"
              >{{ view.label }}</a
            >
          </li>
        }
      </ul>
      @if (ignored().length > 0) {
        <p class="meta-text board-views__note" role="status">
          Esta vista no usa: {{ ignored().join(', ') }}.
        </p>
      }
    </nav>
  `,
  styleUrl: './board-views.scss',
})
export class BoardViews {
  readonly views = BOARD_VIEWS;

  /** The filters to carry to the next view, as the query of the address. */
  readonly params = input<Params>({});

  /** The names of the filters that are on and that this view cannot use. */
  readonly ignored = input<readonly string[]>([]);
}
