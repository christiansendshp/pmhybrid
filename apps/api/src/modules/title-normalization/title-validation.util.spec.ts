import { describe, expect, it } from 'vitest';
import {
  checkAnswer,
  inventedTerms,
  isGroundedTitle,
} from './title-validation.util.js';

const SOURCE =
  'F1-T104\nImplementar sistema automático de validación y conciliación de novedades de asistencia del personal contra las fichadas registradas en SARHA';
const DESCRIPTION =
  'Implementar un sistema automático que permita validar y conciliar las novedades de asistencia del personal contra las fichadas registradas en SARHA.';
const answer = (title: string, description = DESCRIPTION) =>
  JSON.stringify({ title, description });

describe('title answer validation (Roadmap GAP-39c)', () => {
  it('accepts the example of the request', () => {
    const check = checkAnswer(
      answer('Validar y conciliar novedades de asistencia'),
      SOURCE,
    );

    expect(check).toEqual({
      ok: true,
      value: {
        title: 'Validar y conciliar novedades de asistencia',
        description: DESCRIPTION,
      },
    });
  });

  it('tolerates a markdown fence, a sentence around the object, quotes and a final period', () => {
    const fenced = `Aquí está:\n\`\`\`json\n${answer('"Validar y conciliar novedades de asistencia."')}\n\`\`\``;

    const check = checkAnswer(fenced, SOURCE);

    expect(check.ok).toBe(true);
    expect(check.ok && check.value.title).toBe(
      'Validar y conciliar novedades de asistencia',
    );
  });

  it('refuses what is not a JSON object', () => {
    for (const raw of [
      '',
      'sin json',
      '[1,2]',
      '{"title": "x"',
      'null',
      '"texto"',
    ]) {
      const check = checkAnswer(raw, SOURCE);
      expect(check.ok, raw).toBe(false);
      expect(!check.ok && check.problems[0].code, raw).toBe('NOT_JSON');
    }
  });

  it('requires a text title and a real description', () => {
    const noTitle = checkAnswer(
      JSON.stringify({ description: DESCRIPTION }),
      SOURCE,
    );
    const numeric = checkAnswer(
      JSON.stringify({ title: 42, description: DESCRIPTION }),
      SOURCE,
    );
    const noDescription = checkAnswer(
      answer('Validar novedades de asistencia', ''),
      SOURCE,
    );
    const tiny = checkAnswer(
      answer('Validar novedades de asistencia', 'corta'),
      SOURCE,
    );

    expect(!noTitle.ok && noTitle.problems.map((p) => p.code)).toContain(
      'MISSING_TITLE',
    );
    expect(!numeric.ok && numeric.problems.map((p) => p.code)).toContain(
      'MISSING_TITLE',
    );
    expect(
      !noDescription.ok && noDescription.problems.map((p) => p.code),
    ).toContain('MISSING_DESCRIPTION');
    expect(!tiny.ok && tiny.problems.map((p) => p.code)).toContain(
      'MISSING_DESCRIPTION',
    );
  });

  it('refuses a title of more than 10 words, and offers it for a local cut when nothing else is wrong', () => {
    const long =
      'Implementar sistema automático de validación y conciliación de novedades de asistencia del personal';

    const check = checkAnswer(answer(long), SOURCE);

    expect(check.ok).toBe(false);
    expect(!check.ok && check.problems.map((p) => p.code)).toEqual([
      'TITLE_TOO_LONG',
    ]);
    expect(!check.ok && check.salvage).toEqual({
      title: long,
      description: DESCRIPTION,
    });
  });

  it('offers no local cut when something else is wrong too', () => {
    const check = checkAnswer(
      answer(
        'Implementar sistema automático de validación y conciliación de novedades de asistencia del personal',
        'corta',
      ),
      SOURCE,
    );

    expect(!check.ok && check.salvage).toBeUndefined();
  });

  it('refuses a title about something else', () => {
    const check = checkAnswer(answer('Migrar inventario de almacenes'), SOURCE);

    expect(!check.ok && check.problems.map((p) => p.code)).toContain(
      'UNGROUNDED_TITLE',
    );
  });

  it('refuses an acronym, an identifier or a number the task does not contain', () => {
    const check = checkAnswer(
      answer(
        'Validar novedades de asistencia',
        `${DESCRIPTION} Se integrará con el módulo ZKTECO usando la versión 2026 y el ticket F9-T200.`,
      ),
      SOURCE,
    );

    expect(!check.ok && check.problems.map((p) => p.code)).toContain(
      'INVENTED_TERM',
    );
    expect(
      !check.ok &&
        check.problems.find((p) => p.code === 'INVENTED_TERM')?.message,
    ).toMatch(/ZKTECO/);
  });
});

describe('grounding helpers', () => {
  it('lets a verb stand for a noun of the source, and a missing word not', () => {
    expect(isGroundedTitle('Validar y conciliar novedades', SOURCE)).toBe(true);
    expect(isGroundedTitle('Auditar facturación mensual', SOURCE)).toBe(false);
    expect(isGroundedTitle('UI', SOURCE)).toBe(true);
  });

  it('finds only the terms the source lacks, and leaves list numbers alone', () => {
    expect(inventedTerms('SARHA y F1-T104 en la asistencia', SOURCE)).toEqual(
      [],
    );
    expect(inventedTerms('Pasos: 1) validar 2) conciliar', SOURCE)).toEqual([]);
    expect(inventedTerms('Usa JSON y v2 hacia 2026', SOURCE).sort()).toEqual([
      '2026',
      'JSON',
      'v2',
    ]);
  });
});
