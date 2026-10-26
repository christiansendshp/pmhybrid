import { DatePipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { elapsedText } from '../../core/stage-age.js';
import type { BlockedCount, Waiting, WaitingItem } from '../../core/waiting.service.js';

/** The kinds of waiting, said in words (a colour alone says nothing). */
const KIND_LABEL: Record<WaitingItem['kind'], string> = {
  BLOCKED: 'Bloqueada',
  DECISION: 'Espera una decisión',
  CONFLICT: 'Conflicto abierto',
};

/** What a conflict is about, in words. */
const CONFLICT_KIND: Record<string, string> = {
  ROADMAP_ROW_DISAPPEARED_NO_TERMINAL_LOG: 'la fila salió del Roadmap',
  CONCURRENT_FIELD_EDIT: 'edición simultánea',
  WRITE_BACK_COLLISION: 'el documento cambió mientras se escribía',
  UNRECOGNIZED_STATUS: 'estado no reconocido',
  QA_APPROVAL_REQUIRED: 'falta la aprobación de QA',
};

/**
 * What the project waits for (Roadmap TASK-21): the blocked tasks, the decisions the ledger says wait on
 * someone and the open conflicts, the longest waiting first, with how long each has waited. It adds no
 * query of its own: the list is the API's (TASK-32). The filters of the board keep the tasks they keep,
 * and what is about no task (a conflict of the document as a whole) is always shown.
 */
@Component({
  selector: 'app-waiting',
  imports: [DatePipe, RouterLink],
  templateUrl: './waiting.html',
  styleUrl: './waiting.scss',
})
export class WaitingView {
  readonly waiting = input<Waiting | null>(null);
  /** The list could not be read. */
  readonly failed = input(false);
  /** The ids of the tasks the board's filters keep; null when none is on, so nothing is left out. */
  readonly visibleTaskIds = input<ReadonlySet<string> | null>(null);

  readonly kindLabel = KIND_LABEL;
  readonly conflictKindLabel = (kind: string) => CONFLICT_KIND[kind] ?? kind;
  readonly waitedFor = (since: string) => elapsedText(since);

  /** The items the filters keep. */
  readonly items = computed(() => {
    const kept = this.visibleTaskIds();
    return (this.waiting()?.items ?? []).filter(
      (item) => kept === null || item.taskId === null || kept.has(item.taskId),
    );
  });

  /** The groups with something blocked in them, for the phases and for the epics. */
  readonly groups = computed(() => [
    { title: 'Por fase', counts: this.waiting()?.byPhase ?? [], none: 'Sin fase' },
    { title: 'Por épica', counts: this.waiting()?.byEpic ?? [], none: 'Sin épica' },
  ]);

  readonly nameOf = (count: BlockedCount, none: string) => count.name ?? none;
}
