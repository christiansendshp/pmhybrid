import { Component, computed, input } from '@angular/core';
import { percentLabel, roundPercent } from '../../core/percent.js';

/**
 * A progress bar with its figure (Roadmap UX-03b): a whole-number percentage,
 * `role="progressbar"` with the value for assistive technology, and "sin datos"
 * (no bar fill) when there is no figure to draw.
 */
@Component({
  selector: 'app-progress-bar',
  templateUrl: './progress-bar.html',
  styleUrl: './progress-bar.scss',
})
export class ProgressBar {
  readonly value = input.required<number | null>();
  /** What the bar measures, for assistive technology: "Progreso de Fase 1". */
  readonly label = input('Progreso');

  readonly rounded = computed(() => roundPercent(this.value()));
  readonly text = computed(() => percentLabel(this.value()));
}
