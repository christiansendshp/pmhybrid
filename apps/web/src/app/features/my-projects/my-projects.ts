import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { actorKindLabel } from '../../core/actor-kind.js';
import { describeHttpError } from '../../core/http-error.js';
import {
  PROGRESS_ROLLUP_STRATEGIES,
  PROGRESS_ROLLUP_STRATEGY_LABELS,
  ProgressRollupStrategy,
  ProjectWithSummary,
  ProjectsService,
} from '../../core/projects.service.js';
import { FolderBrowserDialog } from '../../shared/folder-browser-dialog/folder-browser-dialog.js';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Activo',
  PAUSED: 'Pausado',
  ARCHIVED: 'Archivado',
};

/** Brief §19 "MY PROJECTS": every project the user belongs to, its summary, and a quick way in. */
@Component({
  selector: 'app-my-projects',
  imports: [
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './my-projects.html',
  styleUrl: './my-projects.scss',
})
export class MyProjects implements OnInit {
  private readonly projectsService = inject(ProjectsService);
  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);

  readonly projects = signal<ProjectWithSummary[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly creating = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showCreateForm = signal(false);

  readonly rollupStrategies = PROGRESS_ROLLUP_STRATEGIES;
  readonly rollupStrategyLabels = PROGRESS_ROLLUP_STRATEGY_LABELS;
  readonly kindLabel = actorKindLabel;

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.pattern(/\S/)]],
    description: [''],
    docsPath: ['', [Validators.required, Validators.pattern(/\S/)]],
    repoUrl: [''],
    progressRollupStrategy: ['EQUAL_WEIGHT_AVERAGE' as ProgressRollupStrategy],
  });

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  statusLabel(status: string): string {
    return STATUS_LABELS[status] ?? status;
  }

  openCreateForm(): void {
    this.errorMessage.set(null);
    this.showCreateForm.set(true);
  }

  cancelCreate(): void {
    this.form.reset();
    this.showCreateForm.set(false);
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

  private async reload(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.projects.set(await this.projectsService.listMine());
    } catch (error) {
      this.loadError.set(describeHttpError(error, 'No se pudieron cargar tus proyectos.'));
    } finally {
      this.loading.set(false);
    }
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.creating()) {
      return;
    }
    this.creating.set(true);
    this.errorMessage.set(null);
    const { name, description, docsPath, repoUrl, progressRollupStrategy } =
      this.form.getRawValue();
    try {
      await this.projectsService.create({
        name: name.trim(),
        description: description.trim() || undefined,
        docsPath: docsPath.trim(),
        repoUrl: repoUrl.trim() || undefined,
        progressRollupStrategy,
      });
      this.cancelCreate();
      await this.reload();
    } catch (error) {
      this.errorMessage.set(describeHttpError(error, 'No se pudo crear el proyecto.'));
    } finally {
      this.creating.set(false);
    }
  }
}
