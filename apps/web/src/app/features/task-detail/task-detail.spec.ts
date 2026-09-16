import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditEvent, AuditService } from '../../core/audit.service.js';
import { HierarchyService, ProjectHierarchy } from '../../core/hierarchy.service.js';
import { ProjectsService } from '../../core/projects.service.js';
import { TaskDetail as TaskDetailModel, TasksService } from '../../core/tasks.service.js';
import { TaskFormValue } from '../../shared/task-form/task-form.js';
import { TaskDetail } from './task-detail.js';

function taskDetail(overrides: Partial<TaskDetailModel> = {}): TaskDetailModel {
  return {
    id: 't1',
    projectId: 'p1',
    externalId: 'PMH-1',
    title: 'Build API',
    description: null,
    status: 'ASIGNADA',
    phaseId: null,
    epicId: null,
    templateId: null,
    parentTaskId: null,
    assigneeActorId: null,
    priority: null,
    progressPercent: null,
    acceptanceCriteria: 'Endpoints documented',
    startDate: null,
    estimatedDate: null,
    dueDate: null,
    roadmapTable: 'ACTIVE',
    createdAt: '2026-09-15T09:00:00.000Z',
    updatedAt: '2026-09-15T09:00:00.000Z',
    computedProgress: 0,
    subtasks: [],
    dependencies: [],
    assignments: [],
    assignee: null,
    agentLogEvents: [],
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

const FORM_VALUE: TaskFormValue = {
  title: 'Build API v2',
  acceptanceCriteria: 'Endpoints documented',
  description: null,
  priority: null,
  progressPercent: 20,
  startDate: null,
  estimatedDate: null,
  dueDate: null,
};

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

@Component({ template: '<p>Board</p>' })
class BoardStub {}

describe('TaskDetail — details, editing, removal, history and agent activity (brief §6, §17, §25)', () => {
  let getById: ReturnType<typeof vi.fn>;
  let transition: ReturnType<typeof vi.fn>;
  let update: ReturnType<typeof vi.fn>;
  let create: ReturnType<typeof vi.fn>;
  let remove: ReturnType<typeof vi.fn>;
  let myPermissions: ReturnType<typeof vi.fn>;
  let listAudit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getById = vi.fn();
    transition = vi.fn().mockResolvedValue({});
    update = vi.fn().mockResolvedValue({});
    create = vi.fn().mockResolvedValue({});
    remove = vi.fn().mockResolvedValue({});
    myPermissions = vi.fn().mockResolvedValue(['task.delete']);
    listAudit = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'projects/:projectId',
            children: [
              { path: 'tasks/:taskId', component: TaskDetail },
              { path: 'kanban', component: BoardStub },
            ],
          },
        ]),
        {
          provide: TasksService,
          useValue: {
            getById,
            transition,
            update,
            create,
            remove,
            listForProject: vi.fn().mockResolvedValue([]),
          },
        },
        {
          provide: ProjectsService,
          useValue: { listMembers: vi.fn().mockResolvedValue([]), myPermissions },
        },
        { provide: AuditService, useValue: { listForProject: listAudit } },
        { provide: HierarchyService, useValue: { load: vi.fn().mockResolvedValue(HIERARCHY) } },
      ],
    });
  });

  async function render() {
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/projects/p1/tasks/t1', TaskDetail);
    await harness.fixture.whenStable();
    // Let the load that follows the task (members, tasks, hierarchy) settle too.
    await new Promise((resolve) => setTimeout(resolve));
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

    expect(text()).toContain('Todavía no hay entradas de Agentslog para esta tarea.');
    expect(text()).toContain('Todavía no hay cambios registrados.');
  });

  it('shows every task field, including where it sits in the hierarchy', async () => {
    getById.mockResolvedValue(
      taskDetail({
        priority: 'HIGH',
        phaseId: 'ph1',
        epicId: 'ep1',
        dueDate: '2026-10-10T00:00:00.000Z',
        description: 'Public endpoints only',
      }),
    );
    listAudit.mockResolvedValue([]);

    const { text: rawText } = await render();
    // Template line breaks between the placement entries collapse to single spaces.
    const text = () => rawText().replace(/\s+/g, ' ');

    expect(text()).toContain('PMH-1');
    expect(text()).toContain('Endpoints documented');
    expect(text()).toContain('HIGH');
    expect(text()).toContain('Fase: Build · Épica: Public API');
    expect(text()).toContain('Oct 10, 2026');
    expect(text()).toContain('Public endpoints only');
  });

  it('removes the task after confirming and returns to the board', async () => {
    getById.mockResolvedValue(taskDetail());
    listAudit.mockResolvedValue([]);
    const { harness, component, text } = await render();

    expect(text()).toContain('Quitar tarea');
    component.confirmingDelete.set(true);
    harness.detectChanges();
    expect(text()).toContain('¿Quitarla del tablero y del Roadmap?');

    await component.deleteTask();

    expect(remove).toHaveBeenCalledWith('p1', 't1');
    expect(TestBed.inject(Router).url).toBe('/projects/p1/kanban');
  });

  it('offers no removal without task.delete, and stays on the task when removal fails', async () => {
    getById.mockResolvedValue(taskDetail());
    listAudit.mockResolvedValue([]);
    myPermissions.mockResolvedValue([]);
    const { component, text } = await render();

    expect(component.canDelete()).toBe(false);
    expect(text()).not.toContain('Quitar tarea');

    remove.mockRejectedValueOnce(
      new HttpErrorResponse({ status: 403, error: { message: 'Missing permission: task.delete' } }),
    );
    await component.deleteTask();

    expect(component.deleteError()).toBeTruthy();
    expect(TestBed.inject(Router).url).toBe('/projects/p1/tasks/t1');
  });

  it('reloads the history after an action, so it reflects the change just made', async () => {
    getById.mockResolvedValue(taskDetail());
    listAudit.mockResolvedValue([]);
    const { component } = await render();

    await component.transition('EN_DESARROLLO');

    expect(transition).toHaveBeenCalledWith('p1', 't1', 'EN_DESARROLLO');
    expect(listAudit).toHaveBeenCalledTimes(2);
  });

  it('saves an edit through the task form and reloads the task and its history', async () => {
    getById.mockResolvedValue(taskDetail());
    listAudit.mockResolvedValue([]);
    const { component } = await render();

    component.startEditing();
    await component.saveEdit(FORM_VALUE);

    expect(update).toHaveBeenCalledWith('p1', 't1', {
      title: 'Build API v2',
      acceptanceCriteria: 'Endpoints documented',
      description: null,
      priority: null,
      progressPercent: 20,
      startDate: null,
      estimatedDate: null,
      dueDate: null,
    });
    expect(component.editing()).toBe(false);
    expect(getById).toHaveBeenCalledTimes(2);
    expect(listAudit).toHaveBeenCalledTimes(2);
  });

  it('adds a subtask with its acceptance criteria, and keeps the form open with the reason when saving fails', async () => {
    getById.mockResolvedValue(taskDetail());
    listAudit.mockResolvedValue([]);
    const { component } = await render();

    component.startSubtask();
    await component.createSubtask({ ...FORM_VALUE, title: 'Write docs', parentTaskId: 't1' });
    expect(create).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        title: 'Write docs',
        acceptanceCriteria: 'Endpoints documented',
        parentTaskId: 't1',
      }),
    );
    expect(component.addingSubtask()).toBe(false);

    create.mockRejectedValueOnce(
      new HttpErrorResponse({
        status: 400,
        error: { message: 'parentTaskId would create a cycle' },
      }),
    );
    component.startSubtask();
    await component.createSubtask({ ...FORM_VALUE, parentTaskId: 't1' });
    expect(component.addingSubtask()).toBe(true);
    expect(component.formError()).toBeTruthy();
  });
});
