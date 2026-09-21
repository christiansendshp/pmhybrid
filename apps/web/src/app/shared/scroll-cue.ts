import { AfterViewInit, Directive, ElementRef, OnDestroy, inject } from '@angular/core';

/**
 * Where a scrolling row goes on past what is showing: `end` when there is more
 * to the right, `start` when there is more to the left, `both`, or `none`.
 */
export type ScrollMore = 'none' | 'start' | 'end' | 'both';

/** Pixels of slack, so a fractional scroll position is not read as "more to see". */
const SLACK = 1;

export function scrollMore(host: {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}): ScrollMore {
  const start = host.scrollLeft > SLACK;
  const end = host.scrollLeft + host.clientWidth < host.scrollWidth - SLACK;
  if (start && end) {
    return 'both';
  }
  return start ? 'start' : end ? 'end' : 'none';
}

/**
 * A link of a row that scrolls sideways can be past the edge when it becomes
 * the active one, and the row would then show a page the person is not on:
 * bring it into view.
 */
export function showWhenActive(active: boolean, link: HTMLElement): void {
  if (active) {
    link.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
  }
}

/**
 * Says on the element itself (`data-scroll-more`) whether its content goes on
 * past the edge, so the stylesheet can fade that edge (Roadmap UX-02a). A
 * navigation or a table that scrolls sideways in a narrow window otherwise
 * looks complete, and what is out of sight is never looked for.
 */
@Directive({ selector: '[appScrollCue]' })
export class ScrollCue implements AfterViewInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private resizeObserver?: ResizeObserver;
  private mutationObserver?: MutationObserver;
  private readonly update = (): void => {
    this.host.setAttribute('data-scroll-more', scrollMore(this.host));
  };

  ngAfterViewInit(): void {
    this.update();
    this.host.addEventListener('scroll', this.update, { passive: true });
    // Its own width changes with the window; what is inside changes as data
    // arrives, which resizes nothing that is observed but the content.
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.update);
      this.resizeObserver.observe(this.host);
    }
    if (typeof MutationObserver !== 'undefined') {
      this.mutationObserver = new MutationObserver(this.update);
      this.mutationObserver.observe(this.host, { childList: true, subtree: true });
    }
  }

  ngOnDestroy(): void {
    this.host.removeEventListener('scroll', this.update);
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
  }
}
