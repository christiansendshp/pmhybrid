import { formatDate } from '@angular/common';
import type { PaceForecast, PaceWeek } from './pace.service.js';

/** An ISO date (`2026-10-19`) as `19 Oct`: the API's dates are UTC days, so they are shown as that day wherever the browser is. */
export const shortDate = (iso: string, locale: string): string =>
  formatDate(iso, 'd MMM', locale, 'UTC');

export const longDate = (iso: string, locale: string): string =>
  formatDate(iso, 'd MMM y', locale, 'UTC');

const tasksText = (count: number): string => `${count} ${count === 1 ? 'tarea' : 'tareas'}`;

const stillOpenText = (count: number): string =>
  count === 1 ? 'Queda 1 tarea abierta.' : `Quedan ${count} tareas abiertas.`;

/**
 * What the forecast says, in words (Roadmap TASK-37, BR-016). Never one date: a range, with the new work
 * counted, or the reason there is none. It is an estimate and says so.
 */
export function forecastSentence(
  forecast: PaceForecast,
  dateText: (iso: string) => string,
): string {
  switch (forecast.status) {
    case 'NOT_ENOUGH_HISTORY':
      return 'No hay historia suficiente para estimar cuándo termina el trabajo: hacen falta al menos 2 semanas completas desde la primera tarea.';
    case 'NOTHING_OPEN':
      return 'No queda trabajo abierto: no hay nada que estimar.';
    case 'NO_RECENT_COMPLETIONS':
      return `No se cerró ninguna tarea en las últimas semanas completas, así que no hay un ritmo del que estimar una fecha. ${stillOpenText(forecast.openTasks)}`;
    case 'NOT_CONVERGING': {
      const withoutNew = forecast.windows
        .flatMap((window) =>
          window.finishesByIgnoringNewScope === null ? [] : [window.finishesByIgnoringNewScope],
        )
        .sort()[0];
      const base = `El trabajo nuevo llega tan rápido como, o más rápido que, el que se cierra: a este ritmo el trabajo abierto (${tasksText(forecast.openTasks)}) no termina.`;
      return withoutNew
        ? `${base} Sin contar el trabajo nuevo, terminaría hacia el ${dateText(withoutNew)}.`
        : base;
    }
    case 'OK': {
      const open = tasksText(forecast.openTasks);
      const range = forecast.range;
      if (!range) {
        return 'La estimación no dio ninguna fecha.';
      }
      const when =
        range.from === range.to
          ? `hacia el ${dateText(range.from)}`
          : `entre el ${dateText(range.from)} y el ${dateText(range.to)}`;
      const parts = [
        `Al ritmo de las últimas semanas completas, el trabajo abierto (${open}) terminaría ${when}, contando el trabajo nuevo que sigue llegando.`,
        ...forecast.windows
          .filter((window) => window.finishesBy === null && window.completedPerWeek > 0)
          .map(
            (window) =>
              `Con el ritmo de las últimas ${window.weeks} semanas el trabajo nuevo llega tan rápido como se cierra: esa estimación no termina.`,
          ),
        'Es una estimación, no una promesa.',
      ];
      return parts.join(' ');
    }
  }
}

/** What the weekly bars say, in words: how much was closed and created, and which is more. */
export function weeklySentence(weeks: readonly PaceWeek[]): string {
  if (weeks.length === 0) {
    return 'Sin semanas que mostrar.';
  }
  const closed = weeks.reduce((sum, week) => sum + week.completed, 0);
  const created = weeks.reduce((sum, week) => sum + week.created, 0);
  const trend =
    created > closed
      ? 'Se crea más trabajo del que se cierra.'
      : created < closed
        ? 'Se cierra más trabajo del que se crea.'
        : 'Se crea tanto trabajo como se cierra.';
  const partial = weeks.at(-1)?.partial ? ' La última semana aún no termina.' : '';
  const span =
    weeks.length === 1 ? 'En la última semana' : `En las últimas ${weeks.length} semanas`;
  return `${span}: ${closed} ${closed === 1 ? 'tarea cerrada' : 'tareas cerradas'} y ${created} ${created === 1 ? 'creada' : 'creadas'}. ${trend}${partial}`;
}

/** What a burn-up says, in words: how the scope and the finished tasks moved from the first week to the last. */
export function burnUpSentence(
  subject: string,
  points: readonly { scope: number; done: number }[],
): string {
  const first = points.at(0);
  const last = points.at(-1);
  if (!first || !last) {
    return `${subject}: sin datos.`;
  }
  return `${subject}: el alcance pasó de ${first.scope} a ${last.scope} tareas y las terminadas, de ${first.done} a ${last.done}.`;
}

/** The largest figure of the series, at least 1, so a chart of zeros still has a scale. */
export const chartMax = (...series: readonly (readonly number[])[]): number =>
  Math.max(1, ...series.flat());

/** A bar's height as a percentage of the chart's. */
export const percentOfMax = (value: number, max: number): number =>
  max <= 0 ? 0 : Math.round((value / max) * 1000) / 10;

/**
 * The points of a line over a 100 x 40 box, one per value, from the left to the right edge, higher values
 * higher up (SVG's y grows downwards) with a margin so a line at the top or the bottom is not cut.
 */
export function seriesPoints(values: readonly number[], max: number): string {
  const width = 100;
  const height = 40;
  const margin = 2;
  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index * width) / (values.length - 1);
      const y = height - margin - (max <= 0 ? 0 : (value / max) * (height - 2 * margin));
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}
