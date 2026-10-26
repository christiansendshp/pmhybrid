import { DOCUMENT } from '@angular/common';
import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ProjectContext } from '../../core/project-context.js';
import { historyRows, reportFileName, reportSections } from '../../core/report.js';
import { ReportService, type SnapshotDay, type StatusReport } from '../../core/report.service.js';
import { ScrollCue } from '../../shared/scroll-cue';

/** Days of history the table shows. */
const HISTORY_DAYS = 30;

/** The class that makes the print stylesheet leave only the report on the page (see styles.scss). */
export const PRINTING_CLASS = 'printing-report';

/**
 * The weekly status report of the project and its history (Roadmap TASK-49): the report by sections, to copy,
 * download as Markdown or print (the browser's own "save as PDF", so no rendering library is added), and the daily
 * snapshots as a table. It reads the API once per visit; each part says when it could not be read without hiding the
 * other. What is shown is the text as the API wrote it, so what is copied is what is read.
 */
@Component({
  selector: 'app-report',
  imports: [ScrollCue],
  templateUrl: './report.html',
  styleUrl: './report.scss',
})
export class Report implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(ReportService);
  private readonly context = inject(ProjectContext, { optional: true });
  private readonly document = inject(DOCUMENT);

  readonly report = signal<StatusReport | null>(null);
  readonly history = signal<SnapshotDay[] | null>(null);
  readonly loading = signal(true);
  readonly reportFailed = signal(false);
  readonly historyFailed = signal(false);
  /** What the last copy said: done, or that it failed. */
  readonly copyNote = signal('');

  readonly parts = computed(() => {
    const report = this.report();
    return report ? reportSections(report.markdown) : null;
  });
  readonly rows = computed(() => historyRows(this.history() ?? []));

  async ngOnInit(): Promise<void> {
    const projectId = this.route.parent!.snapshot.paramMap.get('projectId')!;
    const [report, history] = await Promise.allSettled([
      this.service.report(projectId),
      this.service.snapshots(projectId, HISTORY_DAYS),
    ]);
    if (report.status === 'fulfilled') {
      this.report.set(report.value);
    } else {
      this.reportFailed.set(true);
    }
    if (history.status === 'fulfilled') {
      this.history.set(history.value);
    } else {
      this.historyFailed.set(true);
    }
    this.loading.set(false);
  }

  async copy(): Promise<void> {
    const markdown = this.report()?.markdown;
    if (markdown === undefined) {
      return;
    }
    try {
      await navigator.clipboard.writeText(markdown);
      this.copyNote.set('Copiado.');
    } catch {
      this.copyNote.set('No se pudo copiar. Selecciona el texto y cópialo a mano.');
    }
  }

  download(): void {
    const report = this.report();
    if (!report) {
      return;
    }
    const url = URL.createObjectURL(
      new Blob([report.markdown], { type: 'text/markdown;charset=utf-8' }),
    );
    const link = this.document.createElement('a');
    link.href = url;
    link.download = reportFileName(this.context?.project()?.name ?? 'proyecto', report.to);
    link.click();
    URL.revokeObjectURL(url);
  }

  print(): void {
    window.print();
  }

  /** The browser is about to print (the button, or Ctrl+P): only the report stays on the page. */
  @HostListener('window:beforeprint')
  onBeforePrint(): void {
    this.document.body.classList.add(PRINTING_CLASS);
  }

  @HostListener('window:afterprint')
  onAfterPrint(): void {
    this.document.body.classList.remove(PRINTING_CLASS);
  }
}
