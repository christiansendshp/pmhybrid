import { formatDate } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SinceVisitService,
  type NewsKind,
  type ProjectNews,
} from '../../core/since-visit.service.js';
import { SinceVisit } from './since-visit.js';

const kind = (titles: string[], count = titles.length): NewsKind => ({
  count,
  tasks: titles.map((title, index) => ({ id: `t${index}`, externalId: `T-${index}`, title })),
});

const project = (overrides: Partial<ProjectNews> = {}): ProjectNews => ({
  projectId: 'p1',
  name: 'Alpha',
  since: '2026-10-19T12:00:00.000Z',
  done: kind([]),
  blocked: kind([]),
  unblocked: kind([]),
  newScope: kind([]),
  conflicts: 0,
  ...overrides,
});

/** The words of an element, each text on its own: elements side by side are separate words, not one. */
function wordsOf(element: Element): string {
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? '');
    }
    node.childNodes.forEach(walk);
  };
  walk(element);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

describe('SinceVisit (Roadmap TASK-39)', () => {
  let get: ReturnType<typeof vi.fn>;
  let markSeen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    get = vi.fn();
    markSeen = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SinceVisitService, useValue: { get, markSeen } }],
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(SinceVisit);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    return {
      fixture,
      root,
      text: () => wordsOf(root),
      cards: () => [...root.querySelectorAll('.since-visit__project')],
      button: (label: string) =>
        [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === label),
      settle: async () => {
        await fixture.whenStable();
        fixture.detectChanges();
      },
    };
  }

  it('says there is nothing new when no project has news', async () => {
    get.mockResolvedValue({ generatedAt: '', projects: [] });

    expect((await render()).text()).toBe(
      'Desde tu última visita Nada nuevo desde tu última visita.',
    );
  });

  it('says it is loading before the answer arrives', async () => {
    get.mockReturnValue(new Promise(() => {}));
    const { root } = await render();

    expect(wordsOf(root)).toContain('Cargando');
  });

  it('says it could not read, and that the rest of the Panel is as it was, when the API fails', async () => {
    get.mockRejectedValue(new Error('down'));

    expect((await render()).root.querySelector('[role="alert"]')?.textContent).toContain(
      'No se pudo leer lo que cambió desde tu última visita',
    );
  });

  it('shows each project with its counts as sentences, from when they count, and its tasks as links', async () => {
    get.mockResolvedValue({
      generatedAt: '',
      projects: [
        project({
          done: kind(['Ship it', 'Fix it'], 14),
          blocked: kind(['Stuck']),
          conflicts: 2,
        }),
      ],
    });
    const { cards } = await render();

    const [card] = cards();
    expect([
      wordsOf(card.querySelector('h3')!),
      [...card.querySelectorAll('.since-visit__sentence')].map((s) => wordsOf(s)),
      [...card.querySelectorAll('.since-visit__tasks a')].map((a) => wordsOf(a)),
      wordsOf(card.querySelector('.since-visit__tasks li.meta-text')!),
      wordsOf(card.querySelector('.since-visit__project-head .meta-text')!),
    ]).toEqual([
      'Alpha',
      ['1 tarea bloqueada', '2 conflictos nuevos', '14 tareas terminadas'],
      ['T-0 Stuck', 'T-0 Ship it', 'T-1 Fix it'],
      'y 12 más',
      `desde el ${formatDate('2026-10-19T12:00:00.000Z', 'd MMM y, HH:mm', 'en-US')}`,
    ]);
  });

  it('links each task to its page in its project, and the project to its board', async () => {
    get.mockResolvedValue({
      generatedAt: '',
      projects: [project({ done: kind(['Ship it']) })],
    });
    const { root } = await render();

    expect([...root.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
      '/projects/p1/kanban',
      '/projects/p1/tasks/t0',
    ]);
  });

  it("links the conflicts to the project's conflicts page", async () => {
    get.mockResolvedValue({ generatedAt: '', projects: [project({ conflicts: 1 })] });
    const { root } = await render();

    expect(
      [...root.querySelectorAll('a')]
        .find((a) => a.textContent?.includes('conflictos'))
        ?.getAttribute('href'),
    ).toBe('/projects/p1/conflicts');
  });

  describe('marking as seen', () => {
    const two = {
      generatedAt: '',
      projects: [
        project({ projectId: 'p1', name: 'Alpha', done: kind(['A']) }),
        project({ projectId: 'p2', name: 'Beta', done: kind(['B']) }),
      ],
    };

    it('calls the API for that project alone and takes it off the list without reloading', async () => {
      get.mockResolvedValue(two);
      markSeen.mockResolvedValue({ projectIds: ['p1'] });
      const { cards, root, settle } = await render();

      root
        .querySelector<HTMLButtonElement>('button[aria-label="Marcar como visto Alpha"]')!
        .click();
      await settle();

      expect([
        markSeen.mock.calls,
        cards().map((card) => wordsOf(card.querySelector('h3')!)),
        get.mock.calls.length,
      ]).toEqual([[[['p1']]], ['Beta'], 1]);
    });

    it('calls the API for all of them, with no project named, and says there is nothing new after', async () => {
      get.mockResolvedValue(two);
      markSeen.mockResolvedValue({ projectIds: ['p1', 'p2'] });
      const { button, text, settle } = await render();

      button('Marcar todo como visto')!.click();
      await settle();

      expect([markSeen.mock.calls, text()]).toEqual([
        [[undefined]],
        'Desde tu última visita Nada nuevo desde tu última visita.',
      ]);
    });

    it('offers to mark all only when there is more than one project', async () => {
      get.mockResolvedValue({ generatedAt: '', projects: [two.projects[0]] });

      expect((await render()).button('Marcar todo como visto')).toBeUndefined();
    });

    it('keeps the list, and says it could not mark it, when the API fails', async () => {
      get.mockResolvedValue(two);
      markSeen.mockRejectedValue(new Error('down'));
      const { cards, root, settle } = await render();

      root
        .querySelector<HTMLButtonElement>('button[aria-label="Marcar como visto Alpha"]')!
        .click();
      await settle();

      expect([cards().length, root.querySelector('[role="alert"]')?.textContent?.trim()]).toEqual([
        2,
        'No se pudo marcar como visto. Reintenta en un momento.',
      ]);
    });
  });
});
