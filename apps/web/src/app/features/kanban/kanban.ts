import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Task, TaskStatus, TasksService } from '../../core/tasks.service.js';

const STATUSES: TaskStatus[] = ['PENDIENTE', 'ASIGNADA', 'EN_DESARROLLO', 'QA', 'TERMINADA'];

/**
 * FASE-07 placeholder: status columns with a plain task list, no drag &
 * drop or filters yet — that's FASE-09. Enough to exercise "crear tarea"
 * and see status per column; TaskDetail is where status actually changes.
 */
@Component({
  selector: 'app-kanban',
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './kanban.html',
})
export class Kanban implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly tasksService = inject(TasksService);
  private readonly fb = inject(FormBuilder);

  readonly statuses = STATUSES;
  readonly tasks = signal<Task[]>([]);
  readonly showCreateForm = signal(false);
  readonly creating = signal(false);

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required]],
  });

  private get projectId(): string {
    return this.route.parent!.snapshot.paramMap.get('projectId')!;
  }

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  tasksFor(status: TaskStatus): Task[] {
    return this.tasks().filter((t) => t.status === status);
  }

  private async reload(): Promise<void> {
    this.tasks.set(await this.tasksService.listForProject(this.projectId));
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.creating()) {
      return;
    }
    this.creating.set(true);
    try {
      await this.tasksService.create(this.projectId, { title: this.form.getRawValue().title });
      this.form.reset();
      this.showCreateForm.set(false);
      await this.reload();
    } finally {
      this.creating.set(false);
    }
  }
}
