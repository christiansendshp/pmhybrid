import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it } from 'vitest';
import { BOARD_VIEWS, BoardViews } from './board-views.js';

@Component({
  imports: [BoardViews],
  template: `<app-board-views [params]="params" [ignored]="ignored" />`,
})
class Host {
  params: Record<string, string> = {};
  ignored: string[] = [];
}

@Component({ template: '<p>Page</p>' })
class Page {}

describe('BoardViews (Roadmap TASK-17)', () => {
  async function render(params: Record<string, string> = {}, ignored: string[] = []) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'projects/:projectId',
            children: [
              { path: 'kanban', component: Host },
              { path: 'list', component: Host },
              { path: 'progress', component: Page },
            ],
          },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    const host = await harness.navigateByUrl('/projects/p1/kanban', Host);
    host.params = params;
    host.ignored = ignored;
    harness.detectChanges();
    return { harness, host };
  }

  const links = (root: HTMLElement) =>
    Array.from(root.querySelectorAll<HTMLAnchorElement>('.board-views__link'));

  it('lists the views that exist and only those, in a navigation landmark with a name', async () => {
    const { harness } = await render();
    const root = harness.routeNativeElement!;

    expect(BOARD_VIEWS.map((view) => view.path)).toEqual([
      'kanban',
      'list',
      'review',
      'agents',
      'timeline',
    ]);
    expect(links(root).map((link) => link.textContent?.trim())).toEqual([
      'Tablero',
      'Lista',
      'En revisión',
      'Por agente',
      'Línea de tiempo',
    ]);
    const nav = root.querySelector('nav');
    expect(nav?.getAttribute('aria-label')).toBe('Vistas del tablero');
  });

  it('points at the sibling views of the project, and marks the one it is on as the current page', async () => {
    const { harness } = await render();
    const [board, list, review, agents, timeline] = links(harness.routeNativeElement!);

    expect(board.getAttribute('href')).toBe('/projects/p1/kanban');
    expect(list.getAttribute('href')).toBe('/projects/p1/list');
    expect(review.getAttribute('href')).toBe('/projects/p1/review');
    expect(agents.getAttribute('href')).toBe('/projects/p1/agents');
    expect(timeline.getAttribute('href')).toBe('/projects/p1/timeline');
    expect(board.getAttribute('aria-current')).toBe('page');
    expect(board.classList.contains('board-views__link--active')).toBe(true);
    expect(list.getAttribute('aria-current')).toBeNull();
  });

  it('carries the filters in the address of every link, so the next view shows the same tasks', async () => {
    const { harness } = await render({ q: 'sync', kind: 'AI_AGENT', stale: '72' });

    const hrefs = links(harness.routeNativeElement!).map((link) => link.getAttribute('href'));

    expect(hrefs).toEqual([
      '/projects/p1/kanban?q=sync&kind=AI_AGENT&stale=72',
      '/projects/p1/list?q=sync&kind=AI_AGENT&stale=72',
      '/projects/p1/review?q=sync&kind=AI_AGENT&stale=72',
      '/projects/p1/agents?q=sync&kind=AI_AGENT&stale=72',
      '/projects/p1/timeline?q=sync&kind=AI_AGENT&stale=72',
    ]);
  });

  it('says nothing about filters a view cannot use when there are none', async () => {
    const { harness } = await render();

    expect(harness.routeNativeElement!.querySelector('.board-views__note')).toBeNull();
  });

  it('says in words which of the filters that are on a view cannot use', async () => {
    const { harness } = await render({ q: 'a' }, ['la agrupación', 'el orden de las columnas']);
    const note = harness.routeNativeElement!.querySelector('.board-views__note');

    expect(note?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Esta vista no usa: la agrupación, el orden de las columnas.',
    );
    expect(note?.getAttribute('role')).toBe('status');
  });

  it('is usable with the keyboard: every view is a link, reachable in order', async () => {
    const { harness } = await render();

    for (const link of links(harness.routeNativeElement!)) {
      expect(link.tagName).toBe('A');
      expect(link.getAttribute('tabindex')).not.toBe('-1');
    }
  });
});
