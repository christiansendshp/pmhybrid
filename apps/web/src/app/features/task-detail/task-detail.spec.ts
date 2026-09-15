import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditEvent, AuditService } from '../../core/audit.service.js';
import { ProjectsService } from '../../core/projects.service.js';
import { TaskDetail as TaskDetailModel, TasksService } from '../../core/tasks.service.js';
import { TaskDetail } from './task-detail.js';

function taskDetail(overrides: Partial<TaskDetailModel> = {}): TaskDetailModel {
  return {
    id: 't1',
    projectId: 'p1',
    title: 'Build API',
    description: null,
    status: 'ASIGNADA',
    phaseId: null,
    epicId: null,
    parentTaskId: null,
    assigneeActorId: null,
    priority: null,
    progressPercent: null,
    createdAt: '2026-09-15T09:00:00.000Z',
    computedProgress: 0,
    subtasks: [],
    dependencies: [],
    assignments: [],
    assignee: null,
    agentLogEvents: [],
    ...overrides,
  };
}

const statusChange: AuditEvent = {
  id: 'e1',
  projectId: 'p1',
  actorId: 'a1',
  entityType: 'Task',
  entityId: 't1',
  operation: 'STATUS_CHANGE',
  previousValue: { status: 'PENDIENTE' },
  newValue: { status: 'ASIGNADA' },
  origin: 'UI',
  occurredAt: '2026-09-15T10:00:00.000Z',
  actor: { id: 'a1', displayName: 'Demo Human', kind: 'HUMAN' },
};

describe('TaskDetail — history and agent activity (brief §17)', () => {
  let getById: ReturnType<typeof vi.fn>;
  let transition: ReturnType<typeof vi.fn>;
  let listAudit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getById = vi.fn();
    transition = vi.fn().mockResolvedValue({});
    listAudit = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'projects/:projectId',
            children: [{ path: 'tasks/:taskId', component: TaskDetail }],
          },
        ]),
        {
          provide: TasksService,
          useValue: { getById, transition, listForProject: vi.fn().mockResolvedValue([]) },
        },
        { provide: ProjectsService, useValue: { listMembers: vi.fn().mockResolvedValue([]) } },
        { provide: AuditService, useValue: { listForProject: listAudit } },
      ],
    });
  });

  async function render() {
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/projects/p1/tasks/t1', TaskDetail);
    await harness.fixture.whenStable();
    harness.detectChanges();
    return { harness, component, text: () => harness.routeNativeElement!.textContent ?? '' };
  }

  it("shows the agent's Agentslog activity and the task's own change history", async () => {
    getById.mockResolvedValue(
      taskDetail({
        agentLogEvents: [
          {
            id: 'l1',
            agentName: 'Codex',
            statusWord: 'IN_PROGRESS',
            summary: 'Started the API',
            timestampFromLog: '2026-09-15T10:00:00.000Z',
            createdAt: '2026-09-15T10:01:00.000Z',
          },
        ],
      }),
    );
    listAudit.mockResolvedValue([statusChange]);

    const { text } = await render();

    expect(listAudit).toHaveBeenCalledWith('p1', {
      entityType: 'Task',
      entityId: 't1',
      limit: 50,
    });
    expect(text()).toContain('Codex');
    expect(text()).toContain('IN_PROGRESS — Started the API');
    expect(text()).toContain('Demo Human — STATUS_CHANGE (UI)');
    expect(text()).toContain('status: PENDIENTE → ASIGNADA');
  });

  it('shows empty states before anything has happened', async () => {
    getById.mockResolvedValue(taskDetail());
    listAudit.mockResolvedValue([]);

    const { text } = await render();

    expect(text()).toContain('No Agentslog entries for this task yet.');
    expect(text()).toContain('No recorded changes yet.');
  });

  it('reloads the history after an action, so it reflects the change just made', async () => {
    getById.mockResolvedValue(taskDetail());
    listAudit.mockResolvedValue([]);
    const { component } = await render();

    await component.transition('EN_DESARROLLO');

    expect(transition).toHaveBeenCalledWith('p1', 't1', 'EN_DESARROLLO');
    expect(listAudit).toHaveBeenCalledTimes(2);
  });
});
