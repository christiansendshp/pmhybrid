import { Injectable, OnDestroy, signal } from '@angular/core';

/** Where the layout changes to its phone form (the breakpoint `app-shell.scss` uses). */
export const COMPACT_QUERY = '(max-width: 720px)';

/**
 * Whether the window is as narrow as a phone's, kept current as it is resized
 * or turned (Roadmap UX-02b). For what a stylesheet cannot do: leaving out of
 * the page what would otherwise take the screen before the content, and
 * bringing it back on request.
 */
@Injectable({ providedIn: 'root' })
export class Viewport implements OnDestroy {
  private readonly query = typeof matchMedia === 'function' ? matchMedia(COMPACT_QUERY) : undefined;
  readonly compact = signal(this.query?.matches ?? false);
  private readonly onChange = (event: { matches: boolean }): void =>
    this.compact.set(event.matches);

  constructor() {
    this.query?.addEventListener('change', this.onChange);
  }

  ngOnDestroy(): void {
    this.query?.removeEventListener('change', this.onChange);
  }
}
