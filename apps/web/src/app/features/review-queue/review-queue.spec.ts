import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth.service.js';
import { ProjectContext } from '../../core/project-context.js';
import { TaskCard, TasksService } from '../../core/tasks.service.js';
import { ReviewQueue } from './review-queue.js';

let sequence = 0;
function card(overrides: Partial<TaskCard> = {}): TaskCard {
  sequence += 1;
  return {
    id: `t${sequence}`,
    projectId: 'p1',
    externalId: `PMH-${sequence}`,
    title: `Task ${sequence}`,
    status: 'QA',
    statusChangedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    createdAt: `2026-09-${String(sequence).padStart(2, '0')}T00:00:00.000Z`,
    ledgerNote: null,
    assignee: { id: 'dev', displayName: 'Codex', kind: 'AI_AGENT', model: null },
    reviewer: null,
    ...overrides,
  } as TaskCard;
}

const ana = { id: 'ana', displayName: 'Ana', kind: 'HUMAN' as const };
const bo = { id: 'bo', displayName: 'Bo', kind: 'HUMAN' as const };

@Component({
  imports: [ReviewQueue],
  template: `<app-review-queue
    projectId="p1"
    [cards]="cards()"
    (changed)="changes = changes + 1"
  />`,
})
class Host {
  readonly cards = signal<TaskCard[]>([]);
  changes = 0;
}

describe('ReviewQueue (Roadmap TASK-19)', () => {
  let transition: ReturnType<typeof vi.fn>;
  let addComment: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    transition = vi.fn().mockResolvedValue({});
    addComment = vi.fn().mockResolvedValue({});
    TestBed.configureTestingModule({
      providers: [
        ProjectContext,
        provideRouter([{ path: 'projects/:projectId/review', component: Host }]),
        { provide: TasksService, useValue: { transition, addComment } },
      ],
    });
  });

  async function render(
    cards: TaskCard[],
    options: { permissions?: string[]; me?: string | null } = {},
  ) {
    const { permissions = ['task.qa.approve', 'task.qa.reject'], me = null } = options;
    TestBed.inject(ProjectContext).permissions.set(permissions);
    TestBed.inject(AuthService).currentActor.set(
      me
        ? { id: me, displayName: me, email: null, kind: 'HUMAN', avatarUrl: null, permissions: [] }
        : null,
    );
    const harness = await RouterTestingHarness.create();
    const host = await harness.navigateByUrl('/projects/p1/review', Host);
    host.cards.set(cards);
    harness.detectChanges();
    const root = harness.routeNativeElement!;
    const flush = async () => {
      await harness.fixture.whenStable();
      harness.detectChanges();
    };
    const text = () => (root.textContent ?? '').replace(/\s+/g, ' ');
    const button = (name: string, within: ParentNode = root) =>
      Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
        (b.textContent ?? '').trim().startsWith(name),
      );
    return { harness, host, root, flush, text, button };
  }

  it('says in words that nothing waits for review', async () => {
    const { root } = await render([]);

    expect(root.querySelector('.review-empty')?.textContent).toContain(
      'No hay tareas esperando revisión.',
    );
    expect(root.querySelector('.review-empty')?.getAttribute('role')).toBe('status');
  });

  it('makes a queue per reviewer, the tasks nobody was asked about named as such, and the oldest first in each', async () => {
    const { root } = await render([
      card({
        externalId: 'A-NEW',
        reviewer: ana,
        statusChangedAt: new Date(Date.now() - 1 * 86_400_000).toISOString(),
      }),
      card({
        externalId: 'A-OLD',
        reviewer: ana,
        statusChangedAt: new Date(Date.now() - 9 * 86_400_000).toISOString(),
      }),
      card({ externalId: 'NOBODY', reviewer: null }),
      card({ externalId: 'B-1', reviewer: bo }),
    ]);

    const titles = Array.from(root.querySelectorAll('.review-group__title')).map((h) =>
      (h.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
    const ids = Array.from(root.querySelectorAll('.review-item__id')).map((id) => id.textContent);

    expect(titles).toEqual(['Sin revisor 1', 'Ana 2', 'Bo 1']);
    expect(ids).toEqual(['NOBODY', 'A-OLD', 'A-NEW', 'B-1']);
  });

  it('puts the queue of the person looking at it first and names it as theirs', async () => {
    const { root } = await render(
      [card({ reviewer: ana }), card({ reviewer: null }), card({ reviewer: bo })],
      { me: 'bo' },
    );

    const titles = Array.from(root.querySelectorAll('.review-group__title')).map((h) =>
      (h.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );

    expect(titles[0]).toBe('Bo 1Tu cola');
    expect(titles.slice(1)).toEqual(['Sin revisor 1', 'Ana 1']);
  });

  it('says who developed each task, how long it has waited and the last thing the ledger said, or that it said nothing', async () => {
    const { text } = await render([
      card({ ledgerNote: 'Handed over for review' }),
      card({ ledgerNote: null, assignee: null }),
    ]);

    expect(text()).toContain('Desarrollada por Codex (Agente IA) · en QA hace 2 d');
    expect(text()).toContain('Última nota del registro: Handed over for review');
    expect(text()).toContain('Desarrollada por nadie');
    expect(text()).toContain('Sin nota en el registro.');
  });

  it('links each task to its page', async () => {
    const { root } = await render([card({ id: 'task-x' })]);

    expect(root.querySelector<HTMLAnchorElement>('.review-item__title')?.getAttribute('href')).toBe(
      '/projects/p1/tasks/task-x',
    );
  });

  describe('approving and rejecting', () => {
    it('shows both buttons to a person who holds both permissions', async () => {
      const { button } = await render([card()]);

      expect(button('Aprobar')).toBeDefined();
      expect(button('Rechazar')).toBeDefined();
    });

    it('shows only the button of the permission a person holds', async () => {
      const approveOnly = await render([card()], { permissions: ['task.qa.approve'] });

      expect(approveOnly.button('Aprobar')).toBeDefined();
      expect(approveOnly.button('Rechazar')).toBeUndefined();
    });

    it('shows no button to a person who may neither', async () => {
      const { root } = await render([card()], { permissions: [] });

      expect(root.querySelector('.review-item__actions')).toBeNull();
      expect(root.querySelectorAll('button')).toHaveLength(0);
    });

    it('approves with the transition the board already has, and says the queue changed', async () => {
      const { host, button, flush } = await render([card({ id: 'task-a' })]);

      button('Aprobar')!.click();
      await flush();

      expect(transition).toHaveBeenCalledWith('p1', 'task-a', 'TERMINADA');
      expect(host.changes).toBe(1);
    });

    it('asks why before it rejects, and says so when there is no reason', async () => {
      const { root, text, button, flush } = await render([card({ id: 'task-r' })]);

      button('Rechazar')!.click();
      await flush();
      expect(root.querySelector('form.review-item__reject')).not.toBeNull();
      expect(root.querySelector('label')?.textContent).toContain(
        'Motivo del rechazo (obligatorio)',
      );
      button('Rechazar y devolver')!.click();
      await flush();

      expect(text()).toContain('Escribe el motivo del rechazo.');
      expect(addComment).not.toHaveBeenCalled();
      expect(transition).not.toHaveBeenCalled();
    });

    it('keeps the reason as a comment first, then sends the task back to development', async () => {
      const { root, host, button, flush } = await render([card({ id: 'task-r' })]);
      button('Rechazar')!.click();
      await flush();
      const textarea = root.querySelector<HTMLTextAreaElement>('textarea')!;
      textarea.value = '  The edge case fails  ';
      textarea.dispatchEvent(new Event('input'));
      await flush();

      button('Rechazar y devolver')!.click();
      await flush();

      expect(addComment).toHaveBeenCalledWith(
        'p1',
        'task-r',
        'Rechazada en revisión: The edge case fails',
      );
      expect(transition).toHaveBeenCalledWith(
        'p1',
        'task-r',
        'EN_DESARROLLO',
        null,
        'The edge case fails',
      );
      expect(addComment.mock.invocationCallOrder[0]).toBeLessThan(
        transition.mock.invocationCallOrder[0],
      );
      expect(host.changes).toBe(1);
    });

    it('does not send the task back when its reason could not be kept', async () => {
      addComment.mockRejectedValue(new Error('boom'));
      const { root, text, host, button, flush } = await render([card({ id: 'task-r' })]);
      button('Rechazar')!.click();
      await flush();
      const textarea = root.querySelector<HTMLTextAreaElement>('textarea')!;
      textarea.value = 'Because';
      textarea.dispatchEvent(new Event('input'));
      await flush();

      button('Rechazar y devolver')!.click();
      await flush();

      expect(transition).not.toHaveBeenCalled();
      expect(text()).toContain('No se pudo rechazar la tarea.');
      expect(host.changes).toBe(0);
    });

    it('says why an approval did not go through, and leaves the queue alone', async () => {
      transition.mockRejectedValue(new Error('refused'));
      const { text, host, button, flush } = await render([card()]);

      button('Aprobar')!.click();
      await flush();

      expect(text()).toContain('No se pudo aprobar la tarea.');
      expect(host.changes).toBe(0);
    });

    it('lets a rejection be cancelled without touching the task', async () => {
      const { root, button, flush } = await render([card()]);
      button('Rechazar')!.click();
      await flush();

      button('Cancelar')!.click();
      await flush();

      expect(root.querySelector('form.review-item__reject')).toBeNull();
      expect(transition).not.toHaveBeenCalled();
      expect(addComment).not.toHaveBeenCalled();
    });
  });
});
