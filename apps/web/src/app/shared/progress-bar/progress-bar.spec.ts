import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ProgressBar } from './progress-bar.js';

describe('ProgressBar (Roadmap UX-03b)', () => {
  function render(value: number | null, label?: string) {
    const fixture = TestBed.createComponent(ProgressBar);
    fixture.componentRef.setInput('value', value);
    if (label) {
      fixture.componentRef.setInput('label', label);
    }
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    return {
      bar: root.querySelector('[role="progressbar"]')!,
      fill: root.querySelector('.bar__fill') as HTMLElement,
      text: root.textContent?.trim(),
    };
  }

  it('shows a whole-number percentage and a fill of that width', () => {
    const { bar, fill, text } = render(85.71428571428571);

    expect(text).toBe('86 %');
    expect(fill.style.width).toBe('86%');
    expect(bar.getAttribute('aria-valuenow')).toBe('86');
    expect(bar.getAttribute('aria-valuetext')).toBe('86 %');
  });

  it('names what it measures for assistive technology', () => {
    expect(render(10, 'Progreso de Fase 1').bar.getAttribute('aria-label')).toBe(
      'Progreso de Fase 1',
    );
    expect(render(10).bar.getAttribute('aria-label')).toBe('Progreso');
  });

  it('says "sin datos" with an empty bar when there is no figure', () => {
    const { bar, fill, text } = render(null);

    expect(text).toBe('sin datos');
    expect(fill.style.width).toBe('0%');
    expect(bar.getAttribute('aria-valuenow')).toBeNull();
    expect(bar.getAttribute('aria-valuetext')).toBe('sin datos');
  });
});
