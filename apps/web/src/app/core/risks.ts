import { formatDate } from '@angular/common';
import type { Light, RiskKind, RiskRef, RiskSignal, Semaphore } from './risks.service.js';

/** The kinds of signal, in the order a person has to look at them: what is late or stuck first. */
export const RISK_KINDS: readonly RiskKind[] = [
  'OVERDUE',
  'BLOCKED_BY_BLOCKED',
  'UNOWNED_IN_DEVELOPMENT',
  'STALE_IN_DEVELOPMENT',
];

/** The heading of a kind of signal, saying what it is; the threshold of a stale task is the project's. */
export function kindHeading(kind: RiskKind, staleAfterHours: number): string {
  switch (kind) {
    case 'OVERDUE':
      return 'Fuera de plazo';
    case 'BLOCKED_BY_BLOCKED':
      return 'Esperan a una tarea bloqueada';
    case 'UNOWNED_IN_DEVELOPMENT':
      return 'En desarrollo y sin responsable';
    case 'STALE_IN_DEVELOPMENT':
      return `En desarrollo y sin actividad hace más de ${hoursText(staleAfterHours)}`;
  }
}

/** Hours as a person says them: under two days in hours, then in days. */
export function hoursText(hours: number): string {
  if (hours < 48) {
    return `${hours} h`;
  }
  // From two days on, so always plural.
  return `${Math.floor(hours / 24)} días`;
}

/** How a task is named in a sentence: its ID, if it has one, and its title. */
export const refText = (ref: RiskRef): string =>
  ref.externalId ? `${ref.externalId} ${ref.title}` : ref.title;

/** What is wrong with the task of a signal, and why, in a sentence of its own. */
export function signalReason(signal: RiskSignal, locale: string): string {
  switch (signal.kind) {
    case 'OVERDUE':
      return signal.dueDate
        ? `Debía estar terminada el ${formatDate(signal.dueDate, 'd MMM y', locale, 'UTC')}`
        : 'Pasó su fecha de entrega';
    case 'BLOCKED_BY_BLOCKED': {
      const blockers = (signal.blockedBy ?? []).map(refText).join(', ');
      return blockers
        ? `Depende de una tarea bloqueada: ${blockers}`
        : 'Depende de una tarea bloqueada';
    }
    case 'UNOWNED_IN_DEVELOPMENT':
      return 'Está en desarrollo y ni una persona ni un agente la tiene';
    case 'STALE_IN_DEVELOPMENT':
      return signal.idleHours === undefined
        ? 'Está en desarrollo sin actividad'
        : `Está en desarrollo y lleva ${hoursText(signal.idleHours)} sin actividad`;
  }
}

/** The signals of one kind, in the order the API gave them. */
export const signalsOfKind = (signals: readonly RiskSignal[], kind: RiskKind): RiskSignal[] =>
  signals.filter((signal) => signal.kind === kind);

/** A light as a word: a colour alone says nothing. */
export function lightWord(light: Light | null): string {
  switch (light) {
    case 'RED':
      return 'Rojo';
    case 'AMBER':
      return 'Ámbar';
    case 'GREEN':
      return 'Verde';
    case null:
      return 'Sin trabajo abierto';
  }
}

/** A shape for each light, so the lights differ without their colour. */
export function lightMark(light: Light | null): string {
  switch (light) {
    case 'RED':
      return '▲';
    case 'AMBER':
      return '◆';
    case 'GREEN':
      return '●';
    case null:
      return '–';
  }
}

const COUNT_PHRASES: readonly [keyof Semaphore['counts'], string, string][] = [
  ['OVERDUE', 'fuera de plazo', 'fuera de plazo'],
  ['BLOCKED_BY_BLOCKED', 'espera a una bloqueada', 'esperan a una bloqueada'],
  ['UNOWNED_IN_DEVELOPMENT', 'en desarrollo sin responsable', 'en desarrollo sin responsable'],
  ['STALE_IN_DEVELOPMENT', 'sin actividad en desarrollo', 'sin actividad en desarrollo'],
];

/**
 * Why a group has the light it has, in words: how much is open and what counts against it. A light alone says
 * nothing (BR-019), so this is always shown with it.
 */
export function semaphoreReason(semaphore: Semaphore): string {
  if (semaphore.open === 0) {
    return 'No hay trabajo abierto';
  }
  const open = semaphore.open === 1 ? '1 tarea abierta' : `${semaphore.open} tareas abiertas`;
  const parts = COUNT_PHRASES.flatMap(([key, one, many]) =>
    semaphore.counts[key] === 0
      ? []
      : [semaphore.counts[key] === 1 ? `1 ${one}` : `${semaphore.counts[key]} ${many}`],
  );
  if (semaphore.blocked > 0) {
    parts.push(semaphore.blocked === 1 ? '1 bloqueada' : `${semaphore.blocked} bloqueadas`);
  }
  return parts.length === 0 ? `${open}, sin señales` : `${open}: ${parts.join(', ')}`;
}

/** The critical path in a sentence: how long it is, and the tasks in the order they have to be done. */
export function pathSentence(steps: readonly { task: RiskRef }[]): string {
  if (steps.length === 0) {
    return 'Ninguna tarea abierta espera a otra: no hay una cadena que cuide.';
  }
  return `La cadena más larga de trabajo abierto tiene ${steps.length} tareas: ${steps
    .map((step) => step.task.externalId ?? step.task.title)
    .join(' → ')}.`;
}
