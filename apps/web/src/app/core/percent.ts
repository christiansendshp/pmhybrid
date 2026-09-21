/**
 * A progress figure as a person reads it (Roadmap UX-03b): a whole number,
 * kept between 0 and 100. The API sends a ratio like 85.71428571428571, and
 * `null` when nothing under a node has any progress data at all.
 */
export function roundPercent(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** `86 %` for a figure, `sin datos` for none. */
export function percentLabel(value: number | null | undefined): string {
  const rounded = roundPercent(value);
  return rounded === null ? 'sin datos' : `${rounded} %`;
}
