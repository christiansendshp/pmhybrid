import type { SnapshotDay } from './report.service.js';

/** The Markdown of the report cut into what the page shows: its title and its sections, each with a heading and a body. */
export interface ReportParts {
  title: string;
  /** What comes between the title and the first section (the week it covers). */
  intro: string;
  sections: { heading: string; body: string }[];
}

/**
 * The report cut at its headings (Roadmap TASK-49), so the page can show each section under a heading a person can
 * navigate by. The text is kept as the API wrote it: nothing is rendered or interpreted, so what is shown is what is
 * copied.
 */
export function reportSections(markdown: string): ReportParts {
  const parts: ReportParts = { title: '', intro: '', sections: [] };
  let current: { heading: string; lines: string[] } | null = null;
  const intro: string[] = [];
  const finish = () => {
    if (current) {
      parts.sections.push({ heading: current.heading, body: current.lines.join('\n').trim() });
    }
  };
  for (const line of markdown.split('\n')) {
    if (line.startsWith('## ')) {
      finish();
      current = { heading: line.slice(3).trim(), lines: [] };
    } else if (line.startsWith('# ') && !parts.title && !current) {
      parts.title = line.slice(2).trim();
    } else if (current) {
      current.lines.push(line);
    } else {
      intro.push(line);
    }
  }
  finish();
  parts.intro = intro.join('\n').trim();
  return parts;
}

/** A name safe in a file name: lower case, no accents, anything else a hyphen, no hyphen at the ends. */
export function slug(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'proyecto'
  );
}

/** The name of the file the report is downloaded as: the project and the day it covers up to. */
export function reportFileName(projectName: string, to: string): string {
  return `informe-${slug(projectName)}-${to.slice(0, 10)}.md`;
}

/** One row of the history table, said in words. */
export interface HistoryRow {
  day: string;
  /** "Registrado" the day it was, or "Aproximado" when it was rebuilt from the tasks' dates. */
  origin: 'Registrado' | 'Aproximado';
  total: string;
  done: string;
  progress: string;
}

const DASH = '—';

/** The history as the table shows it: every row says whether it is recorded or approximate, and what it cannot know is a dash. */
export function historyRows(days: readonly SnapshotDay[]): HistoryRow[] {
  return days.map((entry) => ({
    day: entry.day,
    origin: entry.source === 'RECONSTRUCTED' ? 'Aproximado' : 'Registrado',
    total: String(entry.total),
    done: String(entry.done),
    progress: entry.progress === null ? DASH : `${entry.progress} %`,
  }));
}
