/** How many tasks of a list a section names; the section says how many more there are. */
export const MAX_LISTED = 10;

/** A task as the report names it. */
export interface ReportTask {
  externalId: string | null;
  title: string;
}

export type ReportLight = 'RED' | 'AMBER' | 'GREEN';

export interface ReportInput {
  projectName: string;
  /** The week the report covers: from `from` to `to`. */
  from: Date;
  to: Date;
  progress: {
    /** Null when there is nothing to average. */
    percent: number | null;
    total: number;
    done: number;
    /** The snapshot of seven days ago, or null when there is none. */
    weekAgo: {
      day: string;
      total: number;
      done: number;
      percent: number | null;
      approximate: boolean;
    } | null;
  };
  finished: {
    count: number;
    tasks: readonly (ReportTask & { completedAt: Date })[];
  };
  created: number;
  pace: {
    /** The last complete weeks, oldest first. */
    weeks: readonly { weekStart: string; completed: number; created: number }[];
    forecast: {
      status:
        | 'OK'
        | 'NOT_ENOUGH_HISTORY'
        | 'NOTHING_OPEN'
        | 'NOT_CONVERGING'
        | 'NO_RECENT_COMPLETIONS';
      openTasks: number;
      range: { from: string; to: string } | null;
    };
  };
  waiting: {
    blocked: number;
    decisions: number;
    conflicts: number;
    /** The ledger could not be read, so the decisions it says wait on someone are missing. */
    ledgerUnreadable: boolean;
    oldest: readonly {
      kind: 'BLOCKED' | 'DECISION' | 'CONFLICT';
      label: string;
      since: Date;
    }[];
  };
  risks: {
    light: ReportLight | null;
    open: number;
    /** What counts against the light, as sentences ("1 fuera de plazo"). */
    reasons: readonly string[];
    signals: readonly { kind: string; task: ReportTask; detail: string }[];
    signalsTotal: number;
    criticalPath: readonly ReportTask[];
  };
  inDevelopment: { count: number; tasks: readonly ReportTask[] };
  next: { count: number; tasks: readonly ReportTask[] };
}

/** Text that is safe inside a line of Markdown: no markup of its own and no line breaks (a title is data, not formatting). */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\\`*_{}[\]<>#|~]/g, (mark) => `\\${mark}`);
}

const nameOf = (task: ReportTask): string =>
  task.externalId
    ? `${escapeMarkdown(task.externalId)} ${escapeMarkdown(task.title)}`
    : escapeMarkdown(task.title);

const day = (moment: Date): string => moment.toISOString().slice(0, 10);

const LIGHTS: Record<ReportLight, string> = {
  RED: 'Rojo',
  AMBER: 'Ámbar',
  GREEN: 'Verde',
};

const KIND_WORDS = {
  BLOCKED: 'Bloqueada',
  DECISION: 'Espera una decisión',
  CONFLICT: 'Conflicto abierto',
} as const;

/** A list of at most MAX_LISTED entries, then how many more there are. */
function listed(entries: readonly string[], total: number): string[] {
  const shown = entries.slice(0, MAX_LISTED).map((entry) => `- ${entry}`);
  return total > shown.length
    ? [...shown, `- …y ${total - shown.length} más`]
    : shown;
}

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

function forecastSentence(pace: ReportInput['pace']): string {
  const { status, openTasks, range } = pace.forecast;
  switch (status) {
    case 'OK':
      return range
        ? `Al ritmo de las últimas semanas completas, el trabajo abierto (${plural(openTasks, 'tarea', 'tareas')}) terminaría ${
            range.from === range.to
              ? `hacia el ${range.from}`
              : `entre el ${range.from} y el ${range.to}`
          }, contando el trabajo nuevo que sigue llegando. Es una estimación, no una promesa.`
        : 'La estimación no dio ninguna fecha.';
    case 'NOT_ENOUGH_HISTORY':
      return 'No hay historia suficiente para estimar una fecha: hacen falta al menos 2 semanas completas.';
    case 'NOTHING_OPEN':
      return 'No queda trabajo abierto: no hay nada que estimar.';
    case 'NO_RECENT_COMPLETIONS':
      return 'No se cerró ninguna tarea en las últimas semanas completas: sin ritmo no se puede estimar una fecha.';
    case 'NOT_CONVERGING':
      return 'El trabajo nuevo llega tan rápido como, o más rápido que, el que se cierra: a este ritmo el trabajo abierto no termina.';
  }
}

function progressLines(input: ReportInput): string[] {
  const { percent, total, done, weekAgo } = input.progress;
  const now =
    percent === null
      ? `- Progreso: sin datos (${done} de ${total} tareas terminadas).`
      : `- Progreso: ${percent} % (${done} de ${total} tareas terminadas).`;
  if (!weekAgo) {
    return [now, '- No hay historia de hace 7 días para comparar.'];
  }
  const before = `${weekAgo.done} de ${weekAgo.total} tareas terminadas${
    weekAgo.percent === null ? '' : `, ${weekAgo.percent} %`
  }`;
  return [
    now,
    `- Hace 7 días (${weekAgo.day}): ${before}${weekAgo.approximate ? ' (aproximado: reconstruido de las fechas de las tareas)' : ''}.`,
  ];
}

/**
 * The weekly status report of a project, in plain Markdown (Roadmap TASK-48): built only from figures the app already
 * computes (the progress and its snapshot, the pace, the waits, the risks), with nothing worked out here beyond
 * putting them in words. Titles are escaped, so the Markdown has no markup the tasks did not ask for, and it has no
 * HTML. A project with no tasks gets a report that says so.
 */
export function buildReport(input: ReportInput): string {
  const header = [
    `# Informe de estado: ${escapeMarkdown(input.projectName)}`,
    '',
    `Semana del ${day(input.from)} al ${day(input.to)} (UTC).`,
    '',
  ];
  if (input.progress.total === 0) {
    return [
      ...header,
      'El proyecto no tiene tareas todavía: no hay nada que informar.',
      '',
    ].join('\n');
  }

  const { risks, waiting } = input;
  const waits = waiting.blocked + waiting.decisions + waiting.conflicts;
  const lines: string[] = [
    ...header,
    '## Resumen',
    '',
    ...progressLines(input),
    `- Terminadas esta semana: ${input.finished.count}. Creadas: ${input.created}.`,
    `- Riesgos: ${risks.light ? LIGHTS[risks.light] : 'sin trabajo abierto'}.`,
    `- Esperas: ${waits}.`,
    '',
    '## Qué se terminó',
    '',
    ...(input.finished.count === 0
      ? ['Ninguna tarea se terminó esta semana.']
      : listed(
          input.finished.tasks.map(
            (task) => `${nameOf(task)} (${day(task.completedAt)})`,
          ),
          input.finished.count,
        )),
    '',
    '## Ritmo y pronóstico',
    '',
    ...(input.pace.weeks.length === 0
      ? ['Todavía no hay semanas completas.']
      : input.pace.weeks.map(
          (week) =>
            `- Semana del ${week.weekStart}: ${week.completed} cerradas, ${week.created} creadas.`,
        )),
    '',
    forecastSentence(input.pace),
    '',
    '## Qué espera',
    '',
    ...(waits === 0
      ? ['Nada está esperando.']
      : [
          `${plural(waiting.blocked, 'tarea bloqueada', 'tareas bloqueadas')}, ${plural(
            waiting.decisions,
            'decisión pendiente',
            'decisiones pendientes',
          )} y ${plural(waiting.conflicts, 'conflicto abierto', 'conflictos abiertos')}; la que espera desde hace más, primero.`,
          '',
          ...listed(
            waiting.oldest.map(
              (wait) =>
                `${KIND_WORDS[wait.kind]}: ${escapeMarkdown(wait.label)} (desde el ${day(wait.since)})`,
            ),
            waits,
          ),
        ]),
    ...(waiting.ledgerUnreadable
      ? [
          '',
          'No se pudo leer el registro (Agentslog): faltan las decisiones que dice esperar.',
        ]
      : []),
    '',
    '## Riesgos',
    '',
    risks.light
      ? `Semáforo: ${LIGHTS[risks.light]}. ${plural(risks.open, 'tarea abierta', 'tareas abiertas')}${
          risks.reasons.length === 0
            ? ', sin señales'
            : `: ${risks.reasons.join(', ')}`
        }.`
      : 'No hay trabajo abierto.',
    '',
    ...(risks.signalsTotal === 0
      ? ['No hay señales de riesgo.']
      : listed(
          risks.signals.map(
            (signal) =>
              `${nameOf(signal.task)}: ${escapeMarkdown(signal.detail)}`,
          ),
          risks.signalsTotal,
        )),
    ...(risks.criticalPath.length === 0
      ? []
      : [
          '',
          `Camino crítico (${risks.criticalPath.length} tareas, la primera a hacer primero):`,
          '',
          ...risks.criticalPath.map(
            (task, index) => `${index + 1}. ${nameOf(task)}`,
          ),
        ]),
    '',
    '## En desarrollo',
    '',
    ...(input.inDevelopment.count === 0
      ? ['Nada está en desarrollo.']
      : listed(
          input.inDevelopment.tasks.map(nameOf),
          input.inDevelopment.count,
        )),
    '',
    '## Lo siguiente',
    '',
    ...(input.next.count === 0
      ? ['No hay tareas asignadas esperando a empezar.']
      : listed(input.next.tasks.map(nameOf), input.next.count)),
    '',
  ];
  return lines.join('\n');
}
