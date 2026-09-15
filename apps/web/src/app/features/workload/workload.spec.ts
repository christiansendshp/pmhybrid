import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Actor, ActorsService } from '../../core/actors.service.js';
import { HierarchyService, ProjectHierarchy } from '../../core/hierarchy.service.js';
import { ProjectsService } from '../../core/projects.service.js';
import { WorkloadRow, WorkloadService } from '../../core/workload.service.js';
import { Workload } from './workload.js';

function actor(overrides: Partial<Actor>): Actor {
  return {
    id: 'a1',
    kind: 'HUMAN',
    displayName: 'Ana García',
    email: null,
    avatarUrl: null,
    isActive: true,
    createdAt: '2026-09-01T09:00:00.000Z',
    ...overrides,
  };
}

const BUSY: WorkloadRow = {
  actor: { id: 'codex', displayName: 'Codex', kind: 'AI_AGENT', isActive: true },
  task: { id: 't1', title: 'Build API', phaseId: 'ph1', epicId: null },
  project: { id: 'p1', name: 'Website Relaunch' },
  status: 'EN_DESARROLLO',
  progress: 45,
};

const IDLE: WorkloadRow = {
  actor: { id: 'ana', displayName: 'Ana García', kind: 'HUMAN', isActive: true },
  task: null,
  project: null,
  status: null,
  progress: null,
};

const HIERARCHY: ProjectHierarchy = {
  phases: [
    { id: 'ph1', projectId: 'p1', name: 'Build', order: 1, description: null, status: null },
  ],
  epics: [
    {
      id: 'ep1',
      projectId: 'p1',
      phaseId: 'ph1',
      name: 'API',
      order: 1,
      description: null,
      status: null,
    },
    {
      id: 'ep2',
      projectId: 'p1',
      phaseId: 'ph2',
      name: 'Launch site',
      order: 2,
      description: null,
      status: null,
    },
  ],
  templates: [],
};

describe('Workload (brief §18)', () => {
  let getWorkload: ReturnType<typeof vi.fn>;
  let loadHierarchy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getWorkload = vi.fn().mockResolvedValue([BUSY, IDLE]);
    loadHierarchy = vi.fn().mockResolvedValue(HIERARCHY);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: WorkloadService, useValue: { getWorkload } },
        { provide: ProjectsService, useValue: { listMine: vi.fn().mockResolvedValue([]) } },
        {
          provide: ActorsService,
          useValue: {
            listUsers: vi.fn().mockResolvedValue([actor({ id: 'ana' })]),
            listAgents: vi
              .fn()
              .mockResolvedValue([actor({ id: 'codex', kind: 'AI_AGENT', displayName: 'Codex' })]),
          },
        },
        { provide: HierarchyService, useValue: { load: loadHierarchy } },
      ],
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(Workload);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    const text = () =>
      ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
    return { fixture, component: fixture.componentInstance, text };
  }

  it('lists what each actor is doing and shows idle active actors too', async () => {
    const { fixture, text } = await render();
    const cells = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'),
    ).map((row) =>
      Array.from(row.querySelectorAll('td')).map((cell) =>
        (cell.textContent ?? '').replace(/\s+/g, ' ').trim(),
      ),
    );

    expect(cells).toEqual([
      ['Codex', 'AI agent', 'Website Relaunch', 'Build API', 'EN DESARROLLO', '45%'],
      ['Ana García', 'Human', 'No tasks assigned'],
    ]);
    expect(text()).toContain('2 actors · 1 task · 1 idle');
  });

  it('offers phase and epic filters within a chosen project, and resets them with the project', async () => {
    const { component } = await render();

    await component.setFilter({ projectId: 'p1' });
    expect(loadHierarchy).toHaveBeenCalledWith('p1');
    await component.setFilter({ phaseId: 'ph1' });
    expect(component.epicOptions().map((epic) => epic.id)).toEqual(['ep1']);
    await component.setFilter({ epicId: 'ep1' });
    expect(getWorkload).toHaveBeenLastCalledWith({
      projectId: 'p1',
      phaseId: 'ph1',
      epicId: 'ep1',
    });

    await component.setFilter({ projectId: null });
    expect(getWorkload).toHaveBeenLastCalledWith({
      projectId: undefined,
      phaseId: undefined,
      epicId: undefined,
    });
  });

  it('narrows actors to people or agents and drops an actor of the other kind', async () => {
    const { component } = await render();

    await component.setFilter({ actorId: 'ana' });
    await component.setFilter({ kind: 'AI_AGENT' });

    expect(component.actorOptions().map((option) => option.id)).toEqual(['codex']);
    expect(getWorkload).toHaveBeenLastCalledWith({ kind: 'AI_AGENT', actorId: undefined });
  });
});
