import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HierarchyService, ProjectHierarchy } from '../../core/hierarchy.service.js';
import { ProjectContext } from '../../core/project-context.js';
import { ProjectsService } from '../../core/projects.service.js';
import { TaskCard, TasksService } from '../../core/tasks.service.js';
import { Kanban } from './kanban.js';

function card(overrides: Partial<TaskCard> = {}): TaskCard {
  return {
    id: 't1',
    projectId: 'p1',
    externalId: 'PMH-1',
    title: 'Build API',
    description: null,
    status: 'ASIGNADA',
    phaseId: 'ph1',
    epicId: 'ep1',
    templateId: null,
    parentTaskId: null,
    assigneeActorId: 'codex',
    priority: 'HIGH',
    progressPercent: null,
    acceptanceCriteria: 'Endpoints documented',
    startDate: null,
    estimatedDate: null,
    dueDate: '2099-10-10T00:00:00.000Z',
    completedAt: null,
    roadmapTable: 'BLOCKED',
    blockedReason: 'Waiting on credentials',
    createdAt: '2026-09-15T09:00:00.000Z',
    updatedAt: '2026-09-15T09:00:00.000Z',
    assignee: { id: 'codex', displayName: 'Codex', kind: 'AI_AGENT' },
    computedProgress: 45,
    subtaskCounts: { total: 2, done: 1 },
    dependencyCounts: { total: 1, open: 1 },
    ...overrides,
  };
}

const HIERARCHY: ProjectHierarchy = {
  phases: [
    { id: 'ph1', projectId: 'p1', name: 'Build', order: 1, description: null, status: null },
  ],
  epics: [
    {
      id: 'ep1',
      projectId: 'p1',
      phaseId: 'ph1',
      name: 'Public API',
      order: 1,
      description: null,
      status: null,
    },
  ],
  templates: [],
};

describe('Kanban (brief §15)', () => {
  let listForProject: ReturnType<typeof vi.fn>;
  let transition: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listForProject = vi.fn();
    transition = vi.fn().mockResolvedValue({});
    TestBed.configureTestingModule({
      providers: [
        ProjectContext,
        provideRouter([
          { path: 'projects/:projectId', children: [{ path: 'kanban', component: Kanban }] },
        ]),
        { provide: TasksService, useValue: { listForProject, transition } },
        { provide: ProjectsService, useValue: { listMembers: vi.fn().mockResolvedValue([]) } },
        { provide: HierarchyService, useValue: { load: vi.fn().mockResolvedValue(HIERARCHY) } },
      ],
    });
  });

  async function render(cards: TaskCard[], permissions: string[] = ['task.write']) {
    TestBed.inject(ProjectContext).permissions.set(permissions);
    listForProject.mockResolvedValue(cards);
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/projects/p1/kanban', Kanban);
    await harness.fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    harness.detectChanges();
    const text = () => (harness.routeNativeElement!.textContent ?? '').replace(/\s+/g, ' ');
    return { harness, component, text };
  }

  it('shows every §15 field on a card, including its blocking indicators', async () => {
    const { text, harness } = await render([card()]);
    const cardText = (
      harness.routeNativeElement!.querySelector('.card')!.textContent ?? ''
    ).replace(/\s+/g, ' ');

    for (const expected of [
      'PMH-1',
      'Build API',
      'Alta',
      'Build › Public API',
      'Codex',
      'Agente IA',
      '45%',
      'Subtareas 1/2',
      'Depende de 1 · 1 abierta',
      'Vence 10 Oct',
      'Bloqueada',
    ]) {
      expect(cardText).toContain(expected);
    }
    expect(harness.routeNativeElement!.querySelector('.card--blocked')).not.toBeNull();
    // The reason is text on the card, not only a tooltip (Roadmap UX-03c1).
    expect(harness.routeNativeElement!.querySelector('.card__alert-reason')?.textContent).toContain(
      'Waiting on credentials',
    );
    expect(text()).toContain('EN DESARROLLO');
    expect(text()).toContain('1 de 1 tareas');
  });

  it('marks the assignee of a task in development as fixed, and only then (Roadmap UX-01)', async () => {
    const { harness } = await render([
      card({ id: 't1', status: 'EN_DESARROLLO' }),
      card({ id: 't2', status: 'ASIGNADA' }),
    ]);
    const marks = Array.from(harness.routeNativeElement!.querySelectorAll('.lock-badge'));

    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toContain('Asignación fija');
  });

  it('searches by title or Roadmap ID and says when nothing matches', async () => {
    const { component, harness, text } = await render([
      card(),
      card({
        id: 't2',
        externalId: 'PMH-2',
        title: 'Write docs',
        assignee: null,
        assigneeActorId: null,
      }),
    ]);

    component.patchFilters({ search: 'pmh-2' });
    harness.detectChanges();
    expect(text()).toContain('1 de 2 tareas');
    expect(text()).toContain('Write docs');
    expect(text()).not.toContain('Build API');

    component.patchFilters({ search: 'nothing like this' });
    harness.detectChanges();
    expect(text()).toContain('Ninguna tarea coincide con estos filtros.');

    component.clearFilters();
    harness.detectChanges();
    expect(text()).toContain('2 de 2 tareas');
  });

  it('groups the board into swimlanes', async () => {
    const { component, harness } = await render([
      card(),
      card({ id: 't2', title: 'Write docs', assignee: null, assigneeActorId: null }),
    ]);

    component.groupBy.set('assignee');
    harness.detectChanges();

    const laneTitles = Array.from(harness.routeNativeElement!.querySelectorAll('.lane__title')).map(
      (title) => title.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(laneTitles).toEqual(['Codex 1', 'Sin asignar 1']);
  });

  it('moves a card only on a legal drop, then reloads the board', async () => {
    const assigned = card({ roadmapTable: 'ACTIVE', dependencyCounts: { total: 0, open: 0 } });
    const { component } = await render([assigned]);
    const drop = (from: object, to: object) =>
      ({
        item: { data: assigned },
        previousContainer: from,
        container: to,
      }) as unknown as CdkDragDrop<TaskCard[]>;

    await component.onDrop(drop({}, {}), 'QA');
    expect(transition).not.toHaveBeenCalled();

    await component.onDrop(drop({}, {}), 'EN_DESARROLLO');
    expect(transition).toHaveBeenCalledWith('p1', 't1', 'EN_DESARROLLO');
    expect(listForProject).toHaveBeenCalledTimes(2);
  });

  it('offers "Nueva tarea" only to a member holding task.write (Roadmap SECURITY-02)', async () => {
    const allowed = await render([card()], ['task.write']);
    expect(allowed.harness.routeNativeElement!.textContent).toContain('Nueva tarea');
  });

  it('hides "Nueva tarea" from a member without task.write', async () => {
    const readOnly = await render([card()], []);
    expect(readOnly.harness.routeNativeElement!.textContent).not.toContain('Nueva tarea');
  });
});
