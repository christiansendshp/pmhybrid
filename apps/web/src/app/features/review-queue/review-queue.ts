import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { actorKindLabel } from '../../core/actor-kind.js';
import { AuthService } from '../../core/auth.service.js';
import { describeHttpError } from '../../core/http-error.js';
import { ProjectContext } from '../../core/project-context.js';
import { reviewGroups } from '../../core/review-queue.js';
import { elapsedText } from '../../core/stage-age.js';
import { TaskCard, TasksService } from '../../core/tasks.service.js';
import { ShortTitlePipe } from '../../shared/short-title.pipe.js';

const QA_APPROVE = 'task.qa.approve';
const QA_REJECT = 'task.qa.reject';

/**
 * The tasks waiting for review (Roadmap TASK-19): the tasks in QA as a queue per reviewer, the one that has
 * waited longest first, with who developed it, how long it has waited and what the ledger last said about
 * it. Approving and rejecting are the transitions the board already has, with the permissions they already
 * need: a person who does not hold them does not see the buttons, and the API refuses regardless. A rejection
 * says why, and the reason is kept as a comment on the task.
 */
@Component({
  selector: 'app-review-queue',
  imports: [FormsModule, MatButtonModule, RouterLink, ShortTitlePipe],
  templateUrl: './review-queue.html',
  styleUrl: './review-queue.scss',
})
export class ReviewQueue {
  private readonly tasksService = inject(TasksService);
  private readonly auth = inject(AuthService);
  private readonly context = inject(ProjectContext);

  readonly projectId = input.required<string>();
  readonly cards = input.required<TaskCard[]>();
  /** Something changed on the server: the page reads the queue again. */
  readonly changed = output<void>();

  readonly groups = computed(() =>
    reviewGroups(this.cards(), this.auth.currentActor()?.id ?? null),
  );
  readonly canApprove = computed(() => this.context.permissions().includes(QA_APPROVE));
  readonly canReject = computed(() => this.context.permissions().includes(QA_REJECT));

  /** The task being approved or rejected right now: its buttons wait. */
  readonly acting = signal<string | null>(null);
  /** The task whose rejection is being written. */
  readonly rejecting = signal<string | null>(null);
  readonly reason = signal('');
  readonly error = signal<string | null>(null);

  readonly kindLabel = actorKindLabel;
  readonly waited = (card: TaskCard) => elapsedText(card.statusChangedAt);

  async approve(card: TaskCard): Promise<void> {
    await this.act(
      card,
      async () => {
        await this.tasksService.transition(this.projectId(), card.id, 'TERMINADA');
      },
      'No se pudo aprobar la tarea.',
    );
  }

  startReject(card: TaskCard): void {
    this.error.set(null);
    this.reason.set('');
    this.rejecting.set(card.id);
  }

  cancelReject(): void {
    this.rejecting.set(null);
    this.error.set(null);
  }

  async confirmReject(card: TaskCard): Promise<void> {
    const reason = this.reason().trim();
    if (reason === '') {
      this.error.set('Escribe el motivo del rechazo.');
      return;
    }
    await this.act(
      card,
      async () => {
        // The reason first: a task sent back without it would leave the developer guessing.
        await this.tasksService.addComment(
          this.projectId(),
          card.id,
          `Rechazada en revisión: ${reason}`,
        );
        await this.tasksService.transition(this.projectId(), card.id, 'EN_DESARROLLO');
        this.rejecting.set(null);
      },
      'No se pudo rechazar la tarea.',
    );
  }

  private async act(card: TaskCard, action: () => Promise<void>, failure: string): Promise<void> {
    if (this.acting()) {
      return;
    }
    this.acting.set(card.id);
    this.error.set(null);
    try {
      await action();
      this.changed.emit();
    } catch (error) {
      this.error.set(describeHttpError(error, failure));
    } finally {
      this.acting.set(null);
    }
  }
}
