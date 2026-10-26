import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { BurnUp, type BurnUpPoint } from './burn-up.js';

const POINTS: BurnUpPoint[] = [
  { weekStart: '2026-10-12', scope: 4, done: 0, partial: false },
  { weekStart: '2026-10-19', scope: 8, done: 4, partial: false },
  { weekStart: '2026-10-26', scope: 8, done: 6, partial: true },
];

describe('BurnUp (Roadmap TASK-37)', () => {
  function render(inputs: { points?: BurnUpPoint[]; tableOpen?: boolean } = {}) {
    const fixture = TestBed.createComponent(BurnUp);
    fixture.componentRef.setInput('subject', 'Proyecto');
    fixture.componentRef.setInput('points', inputs.points ?? POINTS);
    if (inputs.tableOpen !== undefined) {
      fixture.componentRef.setInput('tableOpen', inputs.tableOpen);
    }
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    return {
      root,
      sentence: () => root.querySelector('.burn-up__sentence')?.textContent?.trim(),
      line: (kind: 'scope' | 'done') =>
        root.querySelector(`.burn-up__line--${kind}`)?.getAttribute('points'),
      rows: () =>
        [...root.querySelectorAll('tbody tr')].map((row) =>
          [...row.querySelectorAll('th, td')].map((cell) =>
            cell.textContent?.replace(/\s+/g, ' ').trim(),
          ),
        ),
    };
  }

  it('says in words how the scope and the finished tasks moved', () => {
    expect(render().sentence()).toBe(
      'Proyecto: el alcance pasó de 4 a 8 tareas y las terminadas, de 0 a 6.',
    );
  });

  it('draws the scope higher than what is done, both from edge to edge', () => {
    const { line } = render();

    expect([line('scope'), line('done')]).toEqual([
      '0.00,20.00 50.00,2.00 100.00,2.00',
      '0.00,38.00 50.00,20.00 100.00,11.00',
    ]);
  });

  it('draws the scope continuous and what is done dashed, not only in different colours', () => {
    const { root } = render();

    const dash = (kind: string) =>
      root.querySelector(`.burn-up__line--${kind}`)?.getAttribute('stroke-dasharray');
    expect([dash('scope'), dash('done')]).toEqual([null, '6 4']);
  });

  it('has a table with the numbers of every week, saying which one is not over', () => {
    expect(render().rows()).toEqual([
      ['12 Oct', '4', '0'],
      ['19 Oct', '8', '4'],
      ['26 Oct (en curso)', '8', '6'],
    ]);
  });

  it('keeps the table closed unless it is asked open', () => {
    const closed = render().root.querySelector('details')!.open;
    const open = render({ tableOpen: true }).root.querySelector('details')!.open;

    expect([closed, open]).toEqual([false, true]);
  });

  it('says there is no data when it has no weeks', () => {
    expect(render({ points: [] }).sentence()).toBe('Proyecto: sin datos.');
  });
});
