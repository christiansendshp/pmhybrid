import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProgressTaskNode, StatusCounts } from '../../core/tasks.service.js';
import { ProgressTaskNodeItem } from './progress-task-node.js';

function counts(overrides: Partial<StatusCounts> = {}): StatusCounts {
  return { PENDIENTE: 0, ASIGNADA: 0, EN_DESARROLLO: 0, QA: 0, TERMINADA: 0, ...overrides };
}

function taskNode(overrides: Partial<ProgressTaskNode> = {}): ProgressTaskNode {
  return {
    kind: 'TASK',
    id: 't1',
    name: 'Task',
    status: 'PENDIENTE',
    progress: 0,
    statusCounts: counts({ PENDIENTE: 1 }),
    subtasks: [],
    ...overrides,
  };
}

describe('ProgressTaskNodeItem (brief §16 "subtareas en el árbol")', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  function render(task: ProgressTaskNode) {
    const fixture = TestBed.createComponent(ProgressTaskNodeItem);
    fixture.componentRef.setInput('task', task);
    fixture.detectChanges();
    return fixture;
  }

  it('renders a leaf task with no nested list and no status-counts row of its own', () => {
    const fixture = render(taskNode({ name: 'Leaf', status: 'QA', progress: 80 }));
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Leaf');
    expect(text).toContain('QA');
    expect(text).toContain('80 %');
    expect(fixture.nativeElement.querySelector('ul')).toBeNull();
    expect(fixture.nativeElement.querySelector('.status-counts')).toBeNull();
  });

  it('recurses into subtasks at least two levels deep, each rendered as its own row', () => {
    const grandchild = taskNode({ id: 'gc', name: 'Grandchild', status: 'PENDIENTE' });
    const child = taskNode({
      id: 'c',
      name: 'Child',
      status: 'EN_DESARROLLO',
      statusCounts: counts({ EN_DESARROLLO: 1, PENDIENTE: 1 }),
      subtasks: [grandchild],
    });
    const parent = taskNode({
      id: 'p',
      name: 'Parent',
      status: 'TERMINADA',
      statusCounts: counts({ TERMINADA: 1, EN_DESARROLLO: 1, PENDIENTE: 1 }),
      subtasks: [child],
    });

    const fixture = render(parent);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Parent');
    expect(text).toContain('Child');
    expect(text).toContain('Grandchild');
    // Three nested <li class="progress-task">: parent, child, grandchild.
    expect(fixture.nativeElement.querySelectorAll('li.progress-task')).toHaveLength(3);
  });

  it("shows a task's own statusCounts pill row only when it has subtasks", () => {
    const grandchild = taskNode({ id: 'gc', status: 'PENDIENTE' });
    const parent = taskNode({
      id: 'p',
      statusCounts: counts({ TERMINADA: 1, PENDIENTE: 1 }),
      subtasks: [grandchild],
    });

    const fixture = render(parent);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('1 TERMINADA');
    expect(text).toContain('1 PENDIENTE');
    // The parent's own row, not the leaf grandchild's (which has none).
    expect(fixture.nativeElement.querySelectorAll('.status-counts')).toHaveLength(1);
  });
});
