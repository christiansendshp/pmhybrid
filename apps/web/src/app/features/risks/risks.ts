import { Component, LOCALE_ID, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  RISK_KINDS,
  kindHeading,
  lightMark,
  lightWord,
  pathSentence,
  semaphoreReason,
  signalReason,
  signalsOfKind,
} from '../../core/risks.js';
import {
  RisksService,
  type Light,
  type ProjectRisks,
  type RiskSignal,
  type Semaphore,
} from '../../core/risks.service.js';
import { statusLabel } from '../../core/task-status-policy.js';
import { ScrollCue } from '../../shared/scroll-cue';

/** One row of the semaphore table: whose it is, and how it is doing. */
interface LightRow {
  level: 'Proyecto' | 'Fase' | 'Épica';
  name: string;
  semaphore: Semaphore;
}

/**
 * What is going wrong in the project (Roadmap TASK-45): the semaphore of the project, each phase and each epic, the
 * signals with the reason of each, and the critical path. It reads the API once per visit. A light is never alone:
 * it is a word with a shape, and the counts that explain it sit beside it (BR-019).
 */
@Component({
  selector: 'app-risks',
  imports: [RouterLink, ScrollCue],
  templateUrl: './risks.html',
  styleUrl: './risks.scss',
})
export class Risks implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly risksService = inject(RisksService);
  private readonly locale = inject(LOCALE_ID);

  readonly projectId = signal('');
  readonly risks = signal<ProjectRisks | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);

  readonly lightWord = lightWord;
  readonly lightMark = lightMark;
  readonly reason = semaphoreReason;
  readonly statusLabel = statusLabel;

  readonly rows = computed<LightRow[]>(() => {
    const risks = this.risks();
    if (!risks) {
      return [];
    }
    return [
      { level: 'Proyecto', name: 'Todo el proyecto', semaphore: risks.project },
      ...risks.phases.map<LightRow>((phase) => ({
        level: 'Fase',
        name: phase.name,
        semaphore: phase.semaphore,
      })),
      ...risks.epics.map<LightRow>((epic) => ({
        level: 'Épica',
        name: epic.name,
        semaphore: epic.semaphore,
      })),
    ];
  });

  /** The kinds that have a signal, with their signals, in the order a person looks at them. */
  readonly groups = computed(() => {
    const risks = this.risks();
    if (!risks) {
      return [];
    }
    return RISK_KINDS.flatMap((kind) => {
      const signals = signalsOfKind(risks.signals, kind);
      return signals.length === 0
        ? []
        : [{ kind, heading: kindHeading(kind, risks.staleAfterHours), signals }];
    });
  });

  readonly pathText = computed(() => pathSentence(this.risks()?.criticalPath ?? []));

  async ngOnInit(): Promise<void> {
    this.projectId.set(this.route.parent!.snapshot.paramMap.get('projectId')!);
    try {
      this.risks.set(await this.risksService.get(this.projectId()));
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  why(signal: RiskSignal): string {
    return signalReason(signal, this.locale);
  }

  /** The class that colours a light; the word and the shape say it as well. */
  tone(light: Light | null): string {
    return light ? `risk-light--${light.toLowerCase()}` : 'risk-light--none';
  }
}
