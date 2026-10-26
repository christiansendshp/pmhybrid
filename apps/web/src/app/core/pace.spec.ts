import { describe, expect, it } from 'vitest';
import {
  burnUpSentence,
  chartMax,
  forecastSentence,
  longDate,
  percentOfMax,
  seriesPoints,
  shortDate,
  weeklySentence,
} from './pace.js';
import type { PaceForecast, PaceWeek, PaceWindow } from './pace.service.js';

const date = (iso: string) => `<${iso}>`;

const window = (overrides: Partial<PaceWindow> = {}): PaceWindow => ({
  weeks: 2,
  completedPerWeek: 2,
  createdPerWeek: 1,
  finishesBy: '2026-12-30',
  finishesByIgnoringNewScope: '2026-11-29',
  ...overrides,
});

const forecast = (overrides: Partial<PaceForecast> = {}): PaceForecast => ({
  status: 'OK',
  openTasks: 9,
  windows: [window()],
  range: { from: '2026-12-23', to: '2026-12-30' },
  ...overrides,
});

const week = (overrides: Partial<PaceWeek> = {}): PaceWeek => ({
  weekStart: '2026-10-19',
  completed: 0,
  created: 0,
  scope: 0,
  done: 0,
  partial: false,
  ...overrides,
});

describe('dates of the pace (Roadmap TASK-37)', () => {
  it('shows an ISO day as that day, not the one before it west of Greenwich', () => {
    expect(shortDate('2026-10-19', 'en-US')).toBe('19 Oct');
  });

  it('adds the year to a long date', () => {
    expect(longDate('2026-12-23', 'en-US')).toBe('23 Dec 2026');
  });
});

describe('forecastSentence (Roadmap TASK-37, BR-016)', () => {
  it('says there is not enough history, and gives no date', () => {
    const text = forecastSentence(
      forecast({ status: 'NOT_ENOUGH_HISTORY', windows: [], range: null }),
      date,
    );

    expect(text).toContain('No hay historia suficiente');
    expect(text).not.toContain('<');
  });

  it('says nothing is open', () => {
    expect(forecastSentence(forecast({ status: 'NOTHING_OPEN', openTasks: 0 }), date)).toBe(
      'No queda trabajo abierto: no hay nada que estimar.',
    );
  });

  it.each([
    [1, 'Queda 1 tarea abierta.'],
    [4, 'Quedan 4 tareas abiertas.'],
  ])('says nothing was closed lately, with %i open', (open, remaining) => {
    const text = forecastSentence(
      forecast({ status: 'NO_RECENT_COMPLETIONS', openTasks: open, range: null }),
      date,
    );

    expect(text).toContain('No se cerró ninguna tarea');
    expect(text).toContain(remaining);
  });

  it('says the work does not end when new work arrives as fast as it closes, and when it would without the new work', () => {
    const text = forecastSentence(
      forecast({
        status: 'NOT_CONVERGING',
        windows: [
          window({ finishesBy: null, finishesByIgnoringNewScope: '2026-12-23' }),
          window({ weeks: 4, finishesBy: null, finishesByIgnoringNewScope: '2026-11-25' }),
        ],
        range: null,
      }),
      date,
    );

    expect(text).toBe(
      'El trabajo nuevo llega tan rápido como, o más rápido que, el que se cierra: a este ritmo el trabajo abierto (9 tareas) no termina. Sin contar el trabajo nuevo, terminaría hacia el <2026-11-25>.',
    );
  });

  it('gives a range, with the new work counted, and says it is an estimate', () => {
    const text = forecastSentence(forecast(), date);

    expect(text).toBe(
      'Al ritmo de las últimas semanas completas, el trabajo abierto (9 tareas) terminaría entre el <2026-12-23> y el <2026-12-30>, contando el trabajo nuevo que sigue llegando. Es una estimación, no una promesa.',
    );
  });

  it('gives one date when the range is one day', () => {
    const text = forecastSentence(
      forecast({ range: { from: '2026-12-23', to: '2026-12-23' }, openTasks: 1 }),
      date,
    );

    expect(text).toContain('el trabajo abierto (1 tarea) terminaría hacia el <2026-12-23>');
  });

  it('says which pace does not end when only one of the two does', () => {
    const text = forecastSentence(
      forecast({
        windows: [
          window({ weeks: 2, finishesBy: null }),
          window({ weeks: 4, finishesBy: '2026-12-30' }),
        ],
        range: { from: '2026-12-30', to: '2026-12-30' },
      }),
      date,
    );

    expect(text).toContain(
      'Con el ritmo de las últimas 2 semanas el trabajo nuevo llega tan rápido como se cierra: esa estimación no termina.',
    );
  });

  it('says it has no date when the forecast is fine and gives none', () => {
    expect(forecastSentence(forecast({ range: null }), date)).toBe(
      'La estimación no dio ninguna fecha.',
    );
  });
});

describe('weeklySentence', () => {
  it('adds up what was closed and created and says which is more', () => {
    const text = weeklySentence([
      week({ completed: 2, created: 5 }),
      week({ completed: 1, created: 0 }),
    ]);

    expect(text).toBe(
      'En las últimas 2 semanas: 3 tareas cerradas y 5 creadas. Se crea más trabajo del que se cierra.',
    );
  });

  it('says more is closed than created', () => {
    expect(weeklySentence([week({ completed: 4, created: 1 })])).toContain(
      'Se cierra más trabajo del que se crea.',
    );
  });

  it('says as much is created as closed', () => {
    expect(weeklySentence([week({ completed: 1, created: 1 })])).toBe(
      'En la última semana: 1 tarea cerrada y 1 creada. Se crea tanto trabajo como se cierra.',
    );
  });

  it('says the last week is not over', () => {
    expect(weeklySentence([week(), week({ partial: true })])).toContain(
      'La última semana aún no termina.',
    );
  });

  it('says there is nothing to show without weeks', () => {
    expect(weeklySentence([])).toBe('Sin semanas que mostrar.');
  });
});

describe('burnUpSentence', () => {
  it('says how the scope and the finished tasks moved', () => {
    expect(
      burnUpSentence('Proyecto', [
        { scope: 10, done: 2 },
        { scope: 12, done: 5 },
        { scope: 15, done: 9 },
      ]),
    ).toBe('Proyecto: el alcance pasó de 10 a 15 tareas y las terminadas, de 2 a 9.');
  });

  it('says there is no data without weeks', () => {
    expect(burnUpSentence('Fase A', [])).toBe('Fase A: sin datos.');
  });
});

describe('chart geometry', () => {
  it('takes the largest figure of all the series as the scale, at least 1', () => {
    expect([chartMax([1, 4], [2, 3]), chartMax([0, 0])]).toEqual([4, 1]);
  });

  it('turns a figure into a share of the scale, with a decimal', () => {
    expect([
      percentOfMax(1, 3),
      percentOfMax(3, 3),
      percentOfMax(0, 3),
      percentOfMax(2, 0),
    ]).toEqual([33.3, 100, 0, 0]);
  });

  it('draws a line from the left edge to the right one, higher values higher up', () => {
    expect(seriesPoints([0, 5, 10], 10)).toBe('0.00,38.00 50.00,20.00 100.00,2.00');
  });

  it('puts a single value in the middle', () => {
    expect(seriesPoints([10], 10)).toBe('50.00,2.00');
  });

  it('draws a flat line at the bottom for a scale of zero', () => {
    expect(seriesPoints([0, 0], 0)).toBe('0.00,38.00 100.00,38.00');
  });
});
