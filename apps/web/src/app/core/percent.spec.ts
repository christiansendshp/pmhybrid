import { describe, expect, it } from 'vitest';
import { percentLabel, roundPercent } from './percent';

describe('roundPercent / percentLabel (Roadmap UX-03b)', () => {
  it('rounds the API ratio to a whole number', () => {
    expect(roundPercent(85.71428571428571)).toBe(86);
    expect(roundPercent(33.333333)).toBe(33);
    expect(roundPercent(0)).toBe(0);
    expect(roundPercent(100)).toBe(100);
  });

  it('keeps a figure between 0 and 100', () => {
    expect(roundPercent(-4)).toBe(0);
    expect(roundPercent(140)).toBe(100);
  });

  it('has no figure for a missing one', () => {
    expect(roundPercent(null)).toBeNull();
    expect(roundPercent(undefined)).toBeNull();
    expect(roundPercent(Number.NaN)).toBeNull();
  });

  it('writes the figure with a space before the sign, and "sin datos" for none', () => {
    expect(percentLabel(85.714)).toBe('86 %');
    expect(percentLabel(0)).toBe('0 %');
    expect(percentLabel(null)).toBe('sin datos');
  });
});
