import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { describeHttpError } from '../../core/http-error.js';
import { ProjectContext } from '../../core/project-context.js';
import {
  PROGRESS_ROLLUP_STRATEGIES,
  PROGRESS_ROLLUP_STRATEGY_LABELS,
  PROJECT_STATUSES,
  Project,
  ProgressRollupStrategy,
  ProjectStatus,
  ProjectsService,
} from '../../core/projects.service.js';
import { FolderBrowserDialog } from '../../shared/folder-browser-dialog/folder-browser-dialog.js';

const PROJECT_UPDATE = 'project.update';
const NOT_BLANK = /\S/;

const STATUS_LABELS: Record<ProjectStatus, string> = {
  ACTIVE: 'Activo',
  PAUSED: 'Pausado',
  ARCHIVED: 'Archivado',
};

/**
 * Project settings (brief §19 "estado", §20 repository and docs). Everyone in
 * the project can read them; changing them needs project.update, which the
 * API enforces too.
 */
@Component({
  selector: 'app-project-settings',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './project-settings.html',
  styleUrl: './project-settings.scss',
})
export class ProjectSettings {
  private readonly context = inject(ProjectContext);
  private readonly projectsService = inject(ProjectsService);
  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);

  readonly statuses = PROJECT_STATUSES;
  readonly statusLabels = STATUS_LABELS;
  readonly rollupStrategies = PROGRESS_ROLLUP_STRATEGIES;
  readonly rollupStrategyLabels = PROGRESS_ROLLUP_STRATEGY_LABELS;
  readonly project = this.context.project;
  readonly canEdit = computed(() => this.context.permissions().includes(PROJECT_UPDATE));
  readonly saving = signal(false);
  readonly saved = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.pattern(NOT_BLANK)]],
    description: [''],
    status: ['ACTIVE' as ProjectStatus],
    syncIntervalMinutes: [5, [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)]],
    docsPath: ['', [Validators.required, Validators.pattern(NOT_BLANK)]],
    repoUrl: [''],
    progressRollupStrategy: ['EQUAL_WEIGHT_AVERAGE' as ProgressRollupStrategy],
  });

  constructor() {
    // Load the project into the form (and reload it after a save), unless someone is mid-edit.
    effect(() => {
      const project = this.project();
      if (project && this.form.pristine) {
        this.form.reset(toFormValue(project));
      }
    });
    effect(() => {
      if (this.canEdit()) {
        this.form.enable();
      } else {
        this.form.disable();
      }
    });
  }

  async save(): Promise<void> {
    const project = this.project();
    this.form.markAllAsTouched();
    if (!project || !this.canEdit() || this.form.invalid || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.saved.set(false);
    this.errorMessage.set(null);
    const value = this.form.getRawValue();
    try {
      const updated = await this.projectsService.update(project.id, {
        name: value.name.trim(),
        description: value.description.trim() || null,
        status: value.status,
        syncIntervalMinutes: Number(value.syncIntervalMinutes),
        docsPath: value.docsPath.trim(),
        repoUrl: value.repoUrl.trim() || null,
        progressRollupStrategy: value.progressRollupStrategy,
      });
      this.form.markAsPristine();
      this.context.project.set(updated);
      this.saved.set(true);
    } catch (error) {
      this.errorMessage.set(describeHttpError(error, 'No se pudo guardar la configuración.'));
    } finally {
      this.saving.set(false);
    }
  }

  browseDocsPath(): void {
    const initialPath = this.form.controls.docsPath.value.trim() || undefined;
    const dialogRef = this.dialog.open(FolderBrowserDialog, { data: { initialPath } });
    dialogRef.afterClosed().subscribe((chosenPath?: string) => {
      if (chosenPath) {
        this.form.controls.docsPath.setValue(chosenPath);
        this.form.controls.docsPath.markAsDirty();
      }
    });
  }

  discard(): void {
    const project = this.project();
    if (project) {
      this.form.reset(toFormValue(project));
    }
    this.saved.set(false);
    this.errorMessage.set(null);
  }
}

function toFormValue(project: Project) {
  return {
    name: project.name,
    description: project.description ?? '',
    status: project.status as ProjectStatus,
    syncIntervalMinutes: project.syncIntervalMinutes,
    docsPath: project.docsPath,
    repoUrl: project.repoUrl ?? '',
    progressRollupStrategy: project.progressRollupStrategy as ProgressRollupStrategy,
  };
}
