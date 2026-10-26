import { describe, expect, it } from 'vitest';
import {
  buildReport,
  escapeMarkdown,
  MAX_LISTED,
  type ReportInput,
  type ReportTask,
} from './report.util.js';

const task = (n: number, overrides: Partial<ReportTask> = {}): ReportTask => ({
  externalId: `T-${n}`,
  title: `Task ${n}`,
  ...overrides,
});

const input = (overrides: Partial<ReportInput> = {}): ReportInput => ({
  projectName: 'Alpha',
  from: new Date('2026-10-21T12:00:00Z'),
  to: new Date('2026-10-28T12:00:00Z'),
  progress: {
    percent: 62,
    total: 20,
    done: 12,
    weekAgo: {
      day: '2026-10-21',
      total: 18,
      done: 8,
      percent: 44,
      approximate: false,
    },
  },
  finished: {
    count: 2,
    tasks: [
      { ...task(1), completedAt: new Date('2026-10-27T10:00:00Z') },
      { ...task(2), completedAt: new Date('2026-10-25T10:00:00Z') },
    ],
  },
  created: 3,
  pace: {
    weeks: [
      { weekStart: '2026-10-12', completed: 2, created: 1 },
      { weekStart: '2026-10-19', completed: 4, created: 2 },
    ],
    forecast: {
      status: 'OK',
      openTasks: 8,
      range: { from: '2026-12-23', to: '2026-12-30' },
    },
  },
  waiting: {
    blocked: 1,
    decisions: 1,
    conflicts: 0,
    ledgerUnreadable: false,
    oldest: [
      {
        kind: 'DECISION',
        label: 'T-9 Pick a vendor',
        since: new Date('2026-10-10T00:00:00Z'),
      },
      {
        kind: 'BLOCKED',
        label: 'T-3 Ship it',
        since: new Date('2026-10-20T00:00:00Z'),
      },
    ],
  },
  risks: {
    light: 'RED',
    open: 8,
    reasons: ['1 fuera de plazo', '1 bloqueada'],
    signals: [
      {
        kind: 'OVERDUE',
        task: task(4),
        detail: 'Debía estar terminada el 20 Oct 2026',
      },
    ],
    signalsTotal: 1,
    criticalPath: [task(5), task(6)],
  },
  inDevelopment: { count: 1, tasks: [task(7)] },
  next: { count: 1, tasks: [task(8)] },
  ...overrides,
});

const sectionsOf = (markdown: string) =>
  markdown
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3));

describe('escapeMarkdown (Roadmap TASK-48)', () => {
  it('leaves plain text alone', () => {
    expect(escapeMarkdown('Fix the login redirect')).toBe(
      'Fix the login redirect',
    );
  });

  it.each([
    ['*bold*', '\\*bold\\*'],
    ['_it_', '\\_it\\_'],
    ['[link](x)', '\\[link\\](x)'],
    ['<b>html</b>', '\\<b\\>html\\</b\\>'],
    ['# heading', '\\# heading'],
    ['a | b', 'a \\| b'],
    ['`code`', '\\`code\\`'],
    ['back\\slash', 'back\\\\slash'],
  ])('escapes the markup of %s', (text, escaped) => {
    expect(escapeMarkdown(text)).toBe(escaped);
  });

  it('turns line breaks and runs of spaces into single spaces', () => {
    expect(escapeMarkdown('one\n\ntwo   three\r\nfour')).toBe(
      'one two three four',
    );
  });
});

describe('buildReport (Roadmap TASK-48)', () => {
  it('has the title, the week and a section for each of: summary, finished, pace, waits, risks, development and next', () => {
    const markdown = buildReport(input());

    expect([
      markdown.split('\n')[0],
      markdown.split('\n')[2],
      sectionsOf(markdown),
    ]).toEqual([
      '# Informe de estado: Alpha',
      'Semana del 2026-10-21 al 2026-10-28 (UTC).',
      [
        'Resumen',
        'Qué se terminó',
        'Ritmo y pronóstico',
        'Qué espera',
        'Riesgos',
        'En desarrollo',
        'Lo siguiente',
      ],
    ]);
  });

  describe('the summary', () => {
    it('says the progress now and a week ago, and what finished and was created', () => {
      const markdown = buildReport(input());

      expect(markdown).toContain(
        '- Progreso: 62 % (12 de 20 tareas terminadas).',
      );
      expect(markdown).toContain(
        '- Hace 7 días (2026-10-21): 8 de 18 tareas terminadas, 44 %.',
      );
      expect(markdown).toContain('- Terminadas esta semana: 2. Creadas: 3.');
    });

    it('says there is no history to compare with, not a zero, when there is no snapshot', () => {
      const markdown = buildReport(
        input({ progress: { ...input().progress, weekAgo: null } }),
      );

      expect(markdown).toContain(
        '- No hay historia de hace 7 días para comparar.',
      );
      expect(markdown).not.toContain('Hace 7 días');
    });

    it('says a rebuilt week ago is approximate', () => {
      const markdown = buildReport(
        input({
          progress: {
            ...input().progress,
            weekAgo: {
              day: '2026-10-21',
              total: 18,
              done: 8,
              percent: null,
              approximate: true,
            },
          },
        }),
      );

      expect(markdown).toContain(
        '- Hace 7 días (2026-10-21): 8 de 18 tareas terminadas (aproximado: reconstruido de las fechas de las tareas).',
      );
    });

    it('says there is no progress data when there is nothing to average', () => {
      const markdown = buildReport(
        input({ progress: { ...input().progress, percent: null } }),
      );

      expect(markdown).toContain(
        '- Progreso: sin datos (12 de 20 tareas terminadas).',
      );
    });

    it('says the light of the risks and how many waits there are', () => {
      const markdown = buildReport(input());

      expect(markdown).toContain('- Riesgos: Rojo.');
      expect(markdown).toContain('- Esperas: 2.');
    });
  });

  describe('what finished', () => {
    it('names each task with the day it finished', () => {
      expect(buildReport(input())).toContain(
        '- T-1 Task 1 (2026-10-27)\n- T-2 Task 2 (2026-10-25)',
      );
    });

    it('says nothing finished when nothing did', () => {
      const markdown = buildReport(
        input({ finished: { count: 0, tasks: [] } }),
      );

      expect(markdown).toContain('Ninguna tarea se terminó esta semana.');
    });

    it(`names at most ${MAX_LISTED} and says how many more there are`, () => {
      const tasks = Array.from({ length: 14 }, (_, n) => ({
        ...task(n),
        completedAt: new Date('2026-10-27T10:00:00Z'),
      }));

      const markdown = buildReport(input({ finished: { count: 14, tasks } }));

      expect([
        markdown.split('\n').filter((line) => /^- T-\d+ Task \d+ \(/.test(line))
          .length,
        markdown.includes('- …y 4 más'),
      ]).toEqual([MAX_LISTED, true]);
    });
  });

  describe('the pace and the forecast', () => {
    it('lists the complete weeks and gives the range with the new work counted', () => {
      const markdown = buildReport(input());

      expect(markdown).toContain(
        '- Semana del 2026-10-12: 2 cerradas, 1 creadas.',
      );
      expect(markdown).toContain(
        'terminaría entre el 2026-12-23 y el 2026-12-30, contando el trabajo nuevo que sigue llegando. Es una estimación, no una promesa.',
      );
    });

    it.each([
      [
        'NOT_ENOUGH_HISTORY',
        'No hay historia suficiente para estimar una fecha',
      ],
      ['NOTHING_OPEN', 'No queda trabajo abierto'],
      [
        'NO_RECENT_COMPLETIONS',
        'No se cerró ninguna tarea en las últimas semanas completas',
      ],
      ['NOT_CONVERGING', 'el trabajo abierto no termina'],
    ] as const)('says why there is no date for %s', (status, sentence) => {
      const markdown = buildReport(
        input({
          pace: {
            ...input().pace,
            forecast: { status, openTasks: 3, range: null },
          },
        }),
      );

      expect(markdown).toContain(sentence);
    });

    it('says there are no complete weeks yet', () => {
      const markdown = buildReport(
        input({ pace: { ...input().pace, weeks: [] } }),
      );

      expect(markdown).toContain('Todavía no hay semanas completas.');
    });
  });

  describe('what waits', () => {
    it('counts each kind and lists them, each with its kind and since when', () => {
      const markdown = buildReport(input());

      expect(markdown).toContain(
        '1 tarea bloqueada, 1 decisión pendiente y 0 conflictos abiertos; la que espera desde hace más, primero.',
      );
      expect(markdown).toContain(
        '- Espera una decisión: T-9 Pick a vendor (desde el 2026-10-10)\n- Bloqueada: T-3 Ship it (desde el 2026-10-20)',
      );
    });

    it('says nothing is waiting', () => {
      const markdown = buildReport(
        input({
          waiting: {
            blocked: 0,
            decisions: 0,
            conflicts: 0,
            ledgerUnreadable: false,
            oldest: [],
          },
        }),
      );

      expect(markdown).toContain('Nada está esperando.');
    });

    it('says the ledger could not be read, so the list is not complete', () => {
      const markdown = buildReport(
        input({ waiting: { ...input().waiting, ledgerUnreadable: true } }),
      );

      expect(markdown).toContain(
        'No se pudo leer el registro (Agentslog): faltan las decisiones que dice esperar.',
      );
    });
  });

  describe('the risks', () => {
    it('says the light and what counts against it, the signals and the critical path in order', () => {
      const markdown = buildReport(input());

      expect(markdown).toContain(
        'Semáforo: Rojo. 8 tareas abiertas: 1 fuera de plazo, 1 bloqueada.',
      );
      expect(markdown).toContain(
        '- T-4 Task 4: Debía estar terminada el 20 Oct 2026',
      );
      expect(markdown).toContain(
        'Camino crítico (2 tareas, la primera a hacer primero):\n\n1. T-5 Task 5\n2. T-6 Task 6',
      );
    });

    it('says a green project has no signals', () => {
      const markdown = buildReport(
        input({
          risks: {
            ...input().risks,
            light: 'GREEN',
            reasons: [],
            signals: [],
            signalsTotal: 0,
            criticalPath: [],
          },
        }),
      );

      expect(markdown).toContain(
        'Semáforo: Verde. 8 tareas abiertas, sin señales.',
      );
      expect(markdown).toContain('No hay señales de riesgo.');
      expect(markdown).not.toContain('Camino crítico');
    });

    it('says there is no open work when there is no light', () => {
      const markdown = buildReport(
        input({
          risks: {
            ...input().risks,
            light: null,
            open: 0,
            reasons: [],
            signals: [],
            signalsTotal: 0,
            criticalPath: [],
          },
        }),
      );

      expect(markdown).toContain('No hay trabajo abierto.');
      expect(markdown).toContain('- Riesgos: sin trabajo abierto.');
    });
  });

  it('lists what is in development and what is next, and says when there is none', () => {
    const markdown = buildReport(
      input({
        inDevelopment: { count: 0, tasks: [] },
        next: { count: 1, tasks: [task(8)] },
      }),
    );

    expect(markdown).toContain('Nada está en desarrollo.');
    expect(markdown).toContain('## Lo siguiente\n\n- T-8 Task 8');
  });

  it('says a project with no tasks has nothing to report, and gives no sections', () => {
    const markdown = buildReport(
      input({ progress: { percent: null, total: 0, done: 0, weekAgo: null } }),
    );

    expect([
      markdown.includes('El proyecto no tiene tareas todavía'),
      sectionsOf(markdown),
    ]).toEqual([true, []]);
  });

  describe('as Markdown', () => {
    it('escapes the markup a title carries', () => {
      const markdown = buildReport(
        input({
          inDevelopment: {
            count: 1,
            tasks: [
              { externalId: 'T-1', title: '# Ship <b>it</b> [now](http://x)' },
            ],
          },
        }),
      );

      expect(markdown).toContain(
        '- T-1 \\# Ship \\<b\\>it\\</b\\> \\[now\\](http://x)',
      );
    });

    it('escapes the name of the project in the title', () => {
      expect(buildReport(input({ projectName: 'A*B' })).split('\n')[0]).toBe(
        '# Informe de estado: A\\*B',
      );
    });

    it('keeps a title on one line', () => {
      const markdown = buildReport(
        input({
          inDevelopment: {
            count: 1,
            tasks: [{ externalId: null, title: 'one\ntwo' }],
          },
        }),
      );

      expect(markdown).toContain('- one two');
    });

    it('has no raw HTML tag in any section, whatever the data says', () => {
      const markdown = buildReport(
        input({
          finished: {
            count: 1,
            tasks: [
              {
                externalId: 'T-1',
                title: '<script>alert(1)</script>',
                completedAt: new Date('2026-10-27T10:00:00Z'),
              },
            ],
          },
        }),
      );

      expect(/(^|[^\\])<[a-z/]/i.test(markdown)).toBe(false);
    });

    it('ends with one line break', () => {
      expect(buildReport(input()).endsWith('\n')).toBe(true);
    });
  });
});
