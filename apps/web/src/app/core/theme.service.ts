import { Injectable, effect, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'pmhybrid.theme';

/**
 * `styles.scss` themes every `--mat-sys-*` token with `light-dark()`
 * (`theme-type: color-scheme`), which resolves off the *used* value of the
 * CSS `color-scheme` property. Setting it inline on `<html>` overrides the
 * stylesheet's `light dark` (system) default without duplicating the whole
 * `mat.theme()` mixin for a second explicit theme.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>(this.resolveInitial());

  constructor() {
    effect(() => {
      const mode = this.mode();
      document.documentElement.style.colorScheme = mode;
      try {
        localStorage.setItem(STORAGE_KEY, mode);
      } catch {
        // Private browsing or storage disabled — the choice just won't survive a reload.
      }
    });
  }

  toggle(): void {
    this.mode.update((mode) => (mode === 'light' ? 'dark' : 'light'));
  }

  private resolveInitial(): ThemeMode {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        return stored;
      }
    } catch {
      // Fall through to the system preference.
    }
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
}
