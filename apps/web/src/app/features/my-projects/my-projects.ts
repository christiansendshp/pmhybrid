import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { Project, ProjectsService } from '../../core/projects.service.js';

@Component({
  selector: 'app-my-projects',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatListModule,
  ],
  templateUrl: './my-projects.html',
})
export class MyProjects implements OnInit {
  private readonly projectsService = inject(ProjectsService);
  private readonly fb = inject(FormBuilder);

  readonly projects = signal<Project[]>([]);
  readonly loading = signal(true);
  readonly creating = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showCreateForm = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    description: [''],
    docsPath: ['', [Validators.required]],
    repoUrl: [''],
  });

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    try {
      this.projects.set(await this.projectsService.listMine());
    } finally {
      this.loading.set(false);
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.creating()) {
      return;
    }
    this.creating.set(true);
    this.errorMessage.set(null);
    const { name, description, docsPath, repoUrl } = this.form.getRawValue();
    try {
      await this.projectsService.create({
        name,
        description: description || undefined,
        docsPath,
        repoUrl: repoUrl || undefined,
      });
      this.form.reset();
      this.showCreateForm.set(false);
      await this.reload();
    } catch {
      this.errorMessage.set('Could not create the project.');
    } finally {
      this.creating.set(false);
    }
  }
}
