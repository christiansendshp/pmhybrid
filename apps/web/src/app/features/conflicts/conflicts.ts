import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  ConflictFieldDiff,
  diffConflictVersions,
  isFieldEditable,
} from '../../core/conflict-diff.js';
import { describeHttpError } from '../../core/http-error.js';
import { KANBAN_STATUSES } from '../../core/task-status-policy.js';
import {
  Conflict,
  ConflictKind,
  ConflictResolutionKind,
  SynchronizationService,
} from '../../core/synchronization.service.js';

const ROADMAP_TABLES = ['ACTIVE', 'NEAR_TERM', 'BLOCKED'] as const;

const FIELD_LABELS: Record<string, string> = {
  title: 'Outcome (title)',
  acceptanceCriteria: 'Acceptance check',
  status: 'Status',
  rawOwner: 'Owner',
  roadmapTable: 'Roadmap table',
  externalId: 'Roadmap ID',
};

const KIND_EXPLANATIONS: Record<ConflictKind, string> = {
  CONCURRENT_FIELD_EDIT:
    'The app and the document both changed the same field(s) since the last sync.',
  WRITE_BACK_COLLISION:
    'Saving this change collided with a document edit to the same field, so it was not written back.',
  ROADMAP_ROW_DISAPPEARED_NO_TERMINAL_LOG:
    "This task's row is no longer in the Roadmap, and no DONE entry was found for it in the Agentslog — it may have been removed another way, or this may be a mistake.",
};

/** One field of an in-progress MANUAL_EDIT form: its current draft value and how to edit it. */
interface ManualField {
  field: string;
  label: string;
  kind: 'text' | 'status' | 'roadmapTable';
}

/**
 * Conflict resolution (brief §26): local (app) vs. external (document)
 * versions, field by field, with KEEP_LOCAL / KEEP_EXTERNAL / MANUAL_EDIT /
 * DISMISSED. Never auto-resolved — docs/synchronization.md "Conflicts".
 */
@Component({
  selector: 'app-conflicts',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './conflicts.html',
  styleUrl: './conflicts.scss',
})
export class Conflicts implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly syncService = inject(SynchronizationService);

  readonly statuses = KANBAN_STATUSES;
  readonly roadmapTables = ROADMAP_TABLES;
  readonly explanationFor = (kind: ConflictKind) => KIND_EXPLANATIONS[kind];
  readonly labelFor = (field: string) => FIELD_LABELS[field] ?? field;

  readonly conflicts = signal<Conflict[]>([]);
  readonly loading = signal(true);
  readonly showResolved = signal(false);
  readonly error = signal<string | null>(null);
  readonly resolvingId = signal<string | null>(null);
  readonly resolveError = signal<string | null>(null);

  /** The one conflict currently showing a MANUAL_EDIT form, if any. */
  readonly editingConflictId = signal<string | null>(null);
  readonly manualFields = signal<ManualField[]>([]);
  readonly manualValues = signal<Record<string, unknown>>({});

  private get projectId(): string {
    return this.route.parent!.snapshot.paramMap.get('projectId')!;
  }

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  diffFor(conflict: Conflict): ConflictFieldDiff[] {
    return diffConflictVersions(conflict);
  }

  /** Whether this conflict has any field a MANUAL_EDIT could actually apply. */
  hasEditableFields(conflict: Conflict): boolean {
    return this.editableFieldsOf(conflict).length > 0;
  }

  async setFilter(showResolved: boolean): Promise<void> {
    if (this.showResolved() === showResolved) {
      return;
    }
    this.showResolved.set(showResolved);
    await this.reload();
  }

  startManualEdit(conflict: Conflict): void {
    this.resolveError.set(null);
    this.editingConflictId.set(conflict.id);
    const fields = this.editableFieldsOf(conflict);
    this.manualFields.set(fields);
    const values: Record<string, unknown> = {};
    for (const field of fields) {
      values[field.field] = conflict.localVersion[field.field] ?? null;
    }
    this.manualValues.set(values);
  }

  cancelManualEdit(): void {
    this.editingConflictId.set(null);
  }

  setManualValue(field: string, value: unknown): void {
    this.manualValues.set({ ...this.manualValues(), [field]: value });
  }

  async resolve(conflict: Conflict, strategy: ConflictResolutionKind): Promise<void> {
    await this.submitResolution(conflict, strategy);
  }

  async submitManualEdit(conflict: Conflict): Promise<void> {
    await this.submitResolution(conflict, 'MANUAL_EDIT', this.manualValues());
  }

  private async submitResolution(
    conflict: Conflict,
    strategy: ConflictResolutionKind,
    manualValue?: Record<string, unknown>,
  ): Promise<void> {
    if (this.resolvingId()) {
      return;
    }
    this.resolvingId.set(conflict.id);
    this.resolveError.set(null);
    try {
      await this.syncService.resolveConflict(this.projectId, conflict.id, strategy, manualValue);
      this.editingConflictId.set(null);
      await this.reload();
    } catch (error) {
      this.resolveError.set(describeHttpError(error, 'The conflict could not be resolved.'));
    } finally {
      this.resolvingId.set(null);
    }
  }

  private editableFieldsOf(conflict: Conflict): ManualField[] {
    return diffConflictVersions(conflict)
      .filter((diff) => diff.status !== 'external-only' && isFieldEditable(diff.field))
      .map((diff) => ({
        field: diff.field,
        label: this.labelFor(diff.field),
        kind:
          diff.field === 'status'
            ? 'status'
            : diff.field === 'roadmapTable'
              ? 'roadmapTable'
              : 'text',
      }));
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.conflicts.set(await this.syncService.listConflicts(this.projectId, this.showResolved()));
    } catch (error) {
      this.error.set(describeHttpError(error, 'Conflicts could not be loaded.'));
    } finally {
      this.loading.set(false);
    }
  }
}
