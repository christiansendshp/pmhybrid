import { Component, OnInit, inject, signal } from '@angular/core';
import { NotificationsService, type SummaryFrequency } from '../../core/notifications.service.js';

/** The options, in the words the person reads. */
export const SUMMARY_OPTIONS: readonly { value: SummaryFrequency; label: string }[] = [
  { value: 'DAILY', label: 'Diario' },
  { value: 'WEEKLY', label: 'Semanal' },
  { value: 'NONE', label: 'Ninguno' },
];

/**
 * How often the person is sent the summary of what changed in their projects (Roadmap TASK-42), in the app only.
 * It is theirs alone: the API takes it from their session.
 */
@Component({
  selector: 'app-notification-preferences',
  template: `
    <div class="notification-preferences">
      <label for="summary-frequency">Resumen de lo que cambió</label>
      <select
        #select
        id="summary-frequency"
        class="notification-preferences__select"
        [disabled]="frequency() === null || saving()"
        [value]="frequency() ?? ''"
        (change)="choose(select.value)"
      >
        @for (option of options; track option.value) {
          <option [value]="option.value" [selected]="option.value === frequency()">
            {{ option.label }}
          </option>
        }
      </select>
      @if (failed()) {
        <p class="meta-text" role="alert">No se pudo guardar. Reintenta en un momento.</p>
      }
    </div>
  `,
  styles: `
    .notification-preferences {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2) var(--space-3);
      padding: var(--space-3);
      border-top: 1px solid var(--mat-sys-outline-variant);
      font: var(--mat-sys-body-small);
    }

    .notification-preferences__select {
      min-height: 1.5rem;
      padding: 0 var(--space-2);
      border: 1px solid var(--mat-sys-outline);
      border-radius: var(--radius-sm);
      background: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-on-surface);
      font: inherit;
    }
  `,
})
export class NotificationPreferences implements OnInit {
  private readonly notifications = inject(NotificationsService);

  readonly options = SUMMARY_OPTIONS;
  /** Null until it is read. */
  readonly frequency = signal<SummaryFrequency | null>(null);
  readonly saving = signal(false);
  readonly failed = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      this.frequency.set((await this.notifications.preferences()).summaryFrequency);
    } catch {
      this.failed.set(true);
    }
  }

  async choose(value: string): Promise<void> {
    const chosen = this.options.find((option) => option.value === value)?.value;
    if (!chosen || chosen === this.frequency()) {
      return;
    }
    this.saving.set(true);
    this.failed.set(false);
    try {
      this.frequency.set((await this.notifications.setSummaryFrequency(chosen)).summaryFrequency);
    } catch {
      this.failed.set(true);
    } finally {
      this.saving.set(false);
    }
  }
}
