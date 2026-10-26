import { describe, expect, it } from 'vitest';
import { historyRows, reportFileName, reportSections, slug } from './report.js';
import type { SnapshotDay } from './report.service.js';

const MARKDOWN = [
  '# Informe de estado: Alpha',
  '',
  'Semana del 2026-10-21 al 2026-10-28 (UTC).',
  '',
  '## Resumen',
  '',
  '- Progreso: 62 % (12 de 20 tareas terminadas).',
  '- Terminadas esta semana: 2.',
  '',
  '## Qué espera',
  '',
  'Nada está esperando.',
  '',
].join('\n');

describe('reportSections (Roadmap TASK-49)', () => {
  it('cuts the report into its title, its intro and its sections', () => {
    expect(reportSections(MARKDOWN)).toEqual({
      title: 'Informe de estado: Alpha',
      intro: 'Semana del 2026-10-21 al 2026-10-28 (UTC).',
      sections: [
        {
          heading: 'Resumen',
          body: '- Progreso: 62 % (12 de 20 tareas terminadas).\n- Terminadas esta semana: 2.',
        },
        { heading: 'Qué espera', body: 'Nada está esperando.' },
      ],
    });
  });

  it('keeps the text of a section as it was written, line breaks and escapes included', () => {
    const parts = reportSections('# T\n\n## S\n\n- A \\*b\\* line\n- Another\n\n1. One\n2. Two\n');

    expect(parts.sections[0].body).toBe('- A \\*b\\* line\n- Another\n\n1. One\n2. Two');
  });

  it('has no sections for a report that has none', () => {
    expect(
      reportSections(
        '# Informe de estado: Alpha\n\nEl proyecto no tiene tareas todavía: no hay nada que informar.\n',
      ),
    ).toEqual({
      title: 'Informe de estado: Alpha',
      intro: 'El proyecto no tiene tareas todavía: no hay nada que informar.',
      sections: [],
    });
  });

  it('gives an empty answer for an empty text', () => {
    expect(reportSections('')).toEqual({ title: '', intro: '', sections: [] });
  });
});

describe('slug', () => {
  it.each([
    ['Website Relaunch', 'website-relaunch'],
    ['  Año Nuevo: Fase 2!  ', 'ano-nuevo-fase-2'],
    ['A*B_C', 'a-b-c'],
    ['---', 'proyecto'],
    ['', 'proyecto'],
  ])('turns %j into %j', (text, expected) => {
    expect(slug(text)).toBe(expected);
  });
});

describe('reportFileName', () => {
  it('names the project and the day the report covers up to', () => {
    expect(reportFileName('Website Relaunch', '2026-10-28T12:00:00.000Z')).toBe(
      'informe-website-relaunch-2026-10-28.md',
    );
  });
});

describe('historyRows', () => {
  const day = (overrides: Partial<SnapshotDay>): SnapshotDay => ({
    day: '2026-10-27',
    source: 'RECORDED',
    total: 20,
    done: 12,
    byStatus: null,
    blocked: null,
    openConflicts: null,
    progress: 60,
    ...overrides,
  });

  it('says a recorded day with its figures and its progress', () => {
    expect(historyRows([day({})])).toEqual([
      { day: '2026-10-27', origin: 'Registrado', total: '20', done: '12', progress: '60 %' },
    ]);
  });

  it('says a rebuilt day is approximate and shows a dash for the progress it cannot know', () => {
    expect(historyRows([day({ source: 'RECONSTRUCTED', progress: null })])).toEqual([
      { day: '2026-10-27', origin: 'Aproximado', total: '20', done: '12', progress: '—' },
    ]);
  });

  it('shows a dash for a recorded day that had no progress to give', () => {
    expect(historyRows([day({ progress: null })])[0].progress).toBe('—');
  });

  it('keeps a zero as a zero, not as a dash', () => {
    expect(historyRows([day({ total: 0, done: 0, progress: 0 })])[0]).toMatchObject({
      total: '0',
      done: '0',
      progress: '0 %',
    });
  });

  it('keeps the order it is given', () => {
    expect(
      historyRows([day({ day: '2026-10-25' }), day({ day: '2026-10-26' })]).map((row) => row.day),
    ).toEqual(['2026-10-25', '2026-10-26']);
  });

  it('has no rows for no days', () => {
    expect(historyRows([])).toEqual([]);
  });
});
