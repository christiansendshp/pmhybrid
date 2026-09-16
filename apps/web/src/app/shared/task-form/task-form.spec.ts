import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_HIERARCHY, ProjectHierarchy } from '../../core/hierarchy.service.js';
import { Task } from '../../core/tasks.service.js';
import { TaskForm, TaskFormValue, toCreateTaskInput, toUpdateTaskInput } from './task-form.js';

function task(overrides: Partial<Task> = {}): Task {
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
      name: 'API',
      order: 1,
      description: null,
      status: null,
    },
  ],
  templates: [
    { id: 'tp1', projectId: 'p1', epicId: 'ep1', name: 'Endpoint', order: 1, description: null },
  ],
};

describe('TaskForm (brief §6, §9)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  function render(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(TaskForm);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const saved: TaskFormValue[] = [];
    component.save.subscribe((value) => saved.push(value));
    const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
    return { fixture, component, saved, text };
  }

  it('refuses to create a task without acceptance criteria or an answer to the parent-instance question', () => {
    const { component, saved } = render({ hierarchy: EMPTY_HIERARCHY });

    component.form.patchValue({ title: 'Ship it', acceptanceCriteria: '   ' });
    component.submit();
    expect(saved).toHaveLength(0);
    expect(component.form.controls.acceptanceCriteria.hasError('pattern')).toBe(true);
    expect(component.form.controls.parent.hasError('required')).toBe(true);

    component.form.patchValue({ acceptanceCriteria: 'Deployed to staging', parent: 'none' });
    component.submit();
    expect(saved).toEqual([
      {
        title: 'Ship it',
        acceptanceCriteria: 'Deployed to staging',
        description: null,
        priority: null,
        progressPercent: null,
        startDate: null,
        estimatedDate: null,
        dueDate: null,
        phaseId: null,
        epicId: null,
        templateId: null,
        parentTaskId: null,
      },
    ]);
    expect(toCreateTaskInput(saved[0])).toEqual({
      title: 'Ship it',
      acceptanceCriteria: 'Deployed to staging',
    });
  });

  it('places a task consistently: a template brings its epic and phase, a subtask its parent placement', () => {
    const parent = task({ id: 'parent', phaseId: 'ph1', epicId: 'ep1' });
    const { component, saved } = render({ hierarchy: HIERARCHY, tasks: [parent] });
    component.form.patchValue({ title: 'Endpoint', acceptanceCriteria: 'Tested' });

    component.form.patchValue({ parent: 'template:tp1' });
    component.submit();
    component.form.patchValue({ parent: 'task:parent' });
    component.submit();

    expect(saved[0]).toMatchObject({
      phaseId: 'ph1',
      epicId: 'ep1',
      templateId: 'tp1',
      parentTaskId: null,
    });
    expect(saved[1]).toMatchObject({
      phaseId: 'ph1',
      epicId: 'ep1',
      templateId: null,
      parentTaskId: 'parent',
    });
  });

  it('preselects the parent task when adding a subtask', () => {
    const { component } = render({ hierarchy: EMPTY_HIERARCHY, parentTaskId: 'parent' });

    expect(component.form.controls.parent.value).toBe('task:parent');
  });

  it('flags estimated or due dates before the start date', () => {
    const { fixture, component, saved, text } = render({ hierarchy: EMPTY_HIERARCHY });
    component.form.patchValue({
      title: 'Plan',
      acceptanceCriteria: 'Agreed',
      parent: 'none',
      startDate: '2026-10-10',
      dueDate: '2026-10-01',
    });

    component.submit();
    fixture.detectChanges();

    expect(saved).toHaveLength(0);
    expect(text()).toContain('no pueden ser anteriores a la fecha de inicio');
  });

  it('edits a task: prefills it, clears optional fields with null, and leaves the hierarchy alone unless it changed', () => {
    const existing = task({
      priority: 'HIGH',
      dueDate: '2026-10-10T00:00:00.000Z',
      epicId: 'ep1',
      phaseId: 'ph1',
    });
    const { component, saved } = render({ hierarchy: HIERARCHY, task: existing });

    expect(component.form.getRawValue()).toMatchObject({
      title: 'Build API',
      parent: 'epic:ep1',
      priority: 'HIGH',
      dueDate: '2026-10-10',
    });

    component.form.patchValue({ priority: null, dueDate: '' });
    component.submit();

    const update = toUpdateTaskInput(saved[0]);
    expect(update).toMatchObject({
      priority: null,
      dueDate: null,
      acceptanceCriteria: 'Endpoints documented',
    });
    expect(update).not.toHaveProperty('phaseId');
    expect(update).not.toHaveProperty('epicId');
  });

  it('never sends progress while it is derived from subtasks, nor clears missing acceptance criteria', () => {
    const synced = task({ acceptanceCriteria: null, progressPercent: null });
    const { component, saved } = render({
      hierarchy: EMPTY_HIERARCHY,
      task: synced,
      progressDerived: true,
    });

    expect(component.form.controls.progressPercent.disabled).toBe(true);
    component.submit();

    const update = toUpdateTaskInput(saved[0]);
    expect(update).not.toHaveProperty('progressPercent');
    expect(update).not.toHaveProperty('acceptanceCriteria');
  });
});
