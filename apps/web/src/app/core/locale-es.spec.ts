import { formatDate, registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { describe, expect, it } from 'vitest';

/**
 * The templates format dates with `d MMM y` and `d MMM y, HH:mm`, and the app
 * runs in es-ES (Roadmap UX-03a); this pins what a person reads.
 */
describe('es-ES dates (Roadmap UX-03a)', () => {
  registerLocaleData(localeEs);
  const when = new Date('2026-10-10T13:05:00.000Z');

  it('writes the month in Spanish, day first', () => {
    expect(formatDate(when, 'd MMM y', 'es-ES', 'UTC')).toMatch(/^10 oct\.? 2026$/);
    expect(formatDate(when, 'd MMM y, HH:mm', 'es-ES', 'UTC')).toMatch(/^10 oct\.? 2026, 13:05$/);
  });

  it('writes a percentage with the Spanish decimal comma', () => {
    // `number` pipes read the same locale: 85,7 %, not 85.7%.
    expect(new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(85.714)).toBe(
      '85,7',
    );
  });
});
