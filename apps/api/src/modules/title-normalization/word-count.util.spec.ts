import { describe, expect, it } from 'vitest';
import {
  countWords,
  MAX_TITLE_WORDS,
  needsNormalization,
  truncateToWords,
} from './word-count.util.js';

const words = (n: number) =>
  Array.from({ length: n }, (_, i) => `palabra${i + 1}`).join(' ');

describe('word count (Roadmap GAP-39)', () => {
  it('counts whitespace-separated tokens with a letter or a digit in them', () => {
    expect(countWords('Validar y conciliar novedades')).toBe(4);
    expect(countWords('  varios   espacios\ty\nsaltos  ')).toBe(4);
    expect(countWords('F1-T104 — fix & ship (v2)')).toBe(4);
    expect(countWords('— & • ...')).toBe(0);
    expect(countWords('')).toBe(0);
    expect(countWords('Validación, conciliación; Ñandú')).toBe(3);
  });

  it('keeps a title of 10 words or fewer and flags one of 11 or more', () => {
    expect(MAX_TITLE_WORDS).toBe(10);
    expect(needsNormalization(words(1))).toBe(false);
    expect(needsNormalization(words(10))).toBe(false);
    expect(needsNormalization(words(11))).toBe(true);
    expect(needsNormalization(`${words(10)} — &`)).toBe(false);
  });

  it('cuts to the first words, without ending on a connector or a mark', () => {
    expect(truncateToWords(words(15), 10)).toBe(words(10));
    expect(
      truncateToWords(
        'uno dos tres cuatro cinco seis siete ocho nueve de la asistencia',
        10,
      ),
    ).toBe('uno dos tres cuatro cinco seis siete ocho nueve');
    expect(truncateToWords('uno dos tres, cuatro.', 10)).toBe(
      'uno dos tres, cuatro',
    );
    expect(truncateToWords('corto', 10)).toBe('corto');
    expect(countWords(truncateToWords(words(40), 10))).toBeLessThanOrEqual(10);
  });
});
