import { describe, expect, it } from 'vitest';
import { ShortTitlePipe, fullTitleHint, shortTitle } from './short-title.pipe.js';

const LONG =
  'Modal de avance con fases nombradas durante la generación de un parte, reemplaza el mensaje genérico';
const TEN = 'uno dos tres cuatro cinco seis siete ocho nueve diez';

describe('shortTitle (Roadmap UX-04)', () => {
  it('shows a title of 10 words or fewer as it is', () => {
    expect(shortTitle('Actualizar documentación del proyecto')).toBe(
      'Actualizar documentación del proyecto',
    );
    expect(shortTitle(TEN)).toBe(TEN);
  });

  it('shows the first 10 words of a longer one, with an ellipsis', () => {
    const shown = shortTitle(`${TEN} once doce`);

    expect(shown).toBe(`${TEN}…`);
  });

  it('cuts at a word boundary and does not end on a connector or on punctuation', () => {
    // The tenth word is "de": a title does not end on it.
    expect(shortTitle(LONG)).toBe('Modal de avance con fases nombradas durante la generación…');
  });

  it('keeps the title the LLM already shortened', () => {
    expect(shortTitle('Modal de avance con fases nombradas al generar partes')).toBe(
      'Modal de avance con fases nombradas al generar partes',
    );
  });

  it('is empty for no title, and never throws', () => {
    expect(shortTitle(null)).toBe('');
    expect(shortTitle(undefined)).toBe('');
    expect(shortTitle('')).toBe('');
  });
});

describe('fullTitleHint (Roadmap UX-04)', () => {
  it('gives the whole title only when the view shortened it', () => {
    expect(fullTitleHint(LONG)).toBe(LONG);
    expect(fullTitleHint(TEN)).toBeNull();
    expect(fullTitleHint(null)).toBeNull();
  });
});

describe('ShortTitlePipe (Roadmap UX-04)', () => {
  const pipe = new ShortTitlePipe();

  it('gives the text by default and the tooltip on request', () => {
    expect(pipe.transform(LONG)).toBe(shortTitle(LONG));
    expect(pipe.transform(LONG, 'text')).toBe(shortTitle(LONG));
    expect(pipe.transform(LONG, 'hint')).toBe(LONG);
    expect(pipe.transform(TEN, 'hint')).toBeNull();
  });
});
