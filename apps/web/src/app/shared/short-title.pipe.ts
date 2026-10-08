import { Pipe, PipeTransform } from '@angular/core';
import { needsNormalization, truncateToWords } from '@pmhybrid/shared-types';

const ELLIPSIS = '…';

/**
 * The title as a board card presents it (Roadmap UX-04): one of more than 10
 * words — the rule the LLM normalization uses, defined once in the shared types
 * — is shown as its first 10, cut at a word boundary, with an ellipsis; one of 10
 * or fewer, and one the LLM has already shortened, is shown as it is. Only the
 * view changes: the task keeps its title, and `Roadmap.md` is never touched.
 */
export function shortTitle(title: string | null | undefined): string {
  if (!title) {
    return '';
  }
  if (!needsNormalization(title)) {
    return title;
  }
  const kept = truncateToWords(title);
  return kept ? `${kept}${ELLIPSIS}` : title;
}

/** The whole title, for a tooltip, when the view shortened it; nothing when it is shown whole. */
export function fullTitleHint(title: string | null | undefined): string | null {
  return title && needsNormalization(title) ? title : null;
}

/**
 * `{{ card.title | shortTitle }}` for the text, `[attr.title]="card.title |
 * shortTitle: 'hint'"` for the whole title as a tooltip.
 */
@Pipe({ name: 'shortTitle' })
export class ShortTitlePipe implements PipeTransform {
  transform(title: string | null | undefined, mode: 'text' | 'hint' = 'text'): string | null {
    return mode === 'hint' ? fullTitleHint(title) : shortTitle(title);
  }
}
