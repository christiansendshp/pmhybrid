/** A title of more words than this is normalized; one of this many or fewer is kept as it is (Roadmap GAP-39). */
export const MAX_TITLE_WORDS = 10;

/** A word is a whitespace-separated token with a letter or a digit in it: a lone dash, an ampersand or a bullet is not one. */
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

export function countWords(text: string): number {
  return text.split(/\s+/).filter((token) => HAS_LETTER_OR_DIGIT.test(token)).length;
}

export function needsNormalization(title: string): boolean {
  return countWords(title) > MAX_TITLE_WORDS;
}

/** Small words a title would not sensibly end on once it has been cut. */
const TRAILING_CONNECTORS = new Set([
  'a',
  'al',
  'con',
  'contra',
  'de',
  'del',
  'e',
  'el',
  'en',
  'la',
  'las',
  'lo',
  'los',
  'o',
  'para',
  'por',
  'sin',
  'sobre',
  'u',
  'un',
  'una',
  'y',
  'and',
  'for',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

/**
 * The first `max` words of a text, for when the LLM could not produce a short
 * enough title: it stops at a word boundary and does not end on a connector or
 * a dangling punctuation mark.
 */
export function truncateToWords(text: string, max: number = MAX_TITLE_WORDS): string {
  const kept: string[] = [];
  let words = 0;
  for (const token of text.trim().split(/\s+/)) {
    if (HAS_LETTER_OR_DIGIT.test(token)) {
      if (words === max) {
        break;
      }
      words += 1;
    }
    kept.push(token);
  }
  while (kept.length > 0) {
    const last = kept[kept.length - 1];
    const bare = last.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
    if (!HAS_LETTER_OR_DIGIT.test(last) || TRAILING_CONNECTORS.has(bare)) {
      kept.pop();
    } else {
      break;
    }
  }
  return kept.join(' ').replace(/[\s.,;:]+$/u, '');
}
