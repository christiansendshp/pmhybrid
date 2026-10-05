import { describe, expect, it } from 'vitest';
import {
  documentTitleData,
  personTitleData,
  sourceTitleOf,
} from './title-state.util.js';

const LONG = 'uno dos tres cuatro cinco seis siete ocho nueve diez once';

describe('title state (Roadmap GAP-39d)', () => {
  it('names the title the document holds', () => {
    expect(sourceTitleOf({ title: 'corto', originalTitle: null })).toBe(
      'corto',
    );
    expect(sourceTitleOf({ title: 'corto', originalTitle: LONG })).toBe(LONG);
  });

  it('queues a long title that came from the document, and clears the old normalization', () => {
    expect(
      documentTitleData(
        { description: null, generatedDescription: null },
        LONG,
      ),
    ).toEqual({
      title: LONG,
      originalTitle: null,
      titleNormalization: 'PENDING',
      titleNormalizationError: null,
      titleNormalizedAt: null,
    });
  });

  it('queues nothing for a short title from the document', () => {
    expect(
      documentTitleData(
        { description: null, generatedDescription: null },
        'Tarea corta',
      ),
    ).toMatchObject({
      title: 'Tarea corta',
      titleNormalization: null,
      originalTitle: null,
    });
  });

  it('drops a description the system wrote for the old title, never one a person wrote or edited', () => {
    expect(
      documentTitleData(
        { description: 'generada', generatedDescription: 'generada' },
        'otro',
      ),
    ).toMatchObject({ description: null, generatedDescription: null });
    expect(
      documentTitleData(
        {
          description: 'la escribió alguien',
          generatedDescription: 'generada',
        },
        'otro',
      ),
    ).not.toHaveProperty('description');
    expect(
      documentTitleData(
        { description: 'solo mía', generatedDescription: null },
        'otro',
      ),
    ).not.toHaveProperty('description');
  });

  it('keeps a title a person wrote as it is, however long, and never queues it', () => {
    expect(personTitleData(LONG)).toEqual({
      title: LONG,
      originalTitle: null,
      titleNormalization: null,
      titleNormalizationError: null,
      titleNormalizedAt: null,
    });
  });
});
