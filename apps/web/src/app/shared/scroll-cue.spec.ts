import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ScrollCue, scrollMore } from './scroll-cue';

describe('scrollMore (Roadmap UX-02a)', () => {
  it('says there is more to the right at the start of a row that overflows', () => {
    expect(scrollMore({ scrollLeft: 0, scrollWidth: 500, clientWidth: 300 })).toBe('end');
  });

  it('says there is more on both sides in the middle, and only to the left at the end', () => {
    expect(scrollMore({ scrollLeft: 100, scrollWidth: 500, clientWidth: 300 })).toBe('both');
    expect(scrollMore({ scrollLeft: 200, scrollWidth: 500, clientWidth: 300 })).toBe('start');
  });

  it('says nothing for a row that fits, and ignores a fraction of a pixel', () => {
    expect(scrollMore({ scrollLeft: 0, scrollWidth: 300, clientWidth: 300 })).toBe('none');
    expect(scrollMore({ scrollLeft: 199.6, scrollWidth: 500, clientWidth: 300 })).toBe('start');
    expect(scrollMore({ scrollLeft: 0.4, scrollWidth: 300.5, clientWidth: 300 })).toBe('none');
  });
});

@Component({
  imports: [ScrollCue],
  template: `<div appScrollCue class="row"></div>`,
})
class Host {}

describe('ScrollCue', () => {
  function metrics(el: HTMLElement, values: { scrollWidth: number; clientWidth: number }) {
    Object.defineProperty(el, 'scrollWidth', { configurable: true, value: values.scrollWidth });
    Object.defineProperty(el, 'clientWidth', { configurable: true, value: values.clientWidth });
  }

  it('writes where the row goes on to, and keeps it current as it scrolls', () => {
    const fixture = TestBed.createComponent(Host);
    const row = fixture.nativeElement.querySelector('.row') as HTMLElement;
    metrics(row, { scrollWidth: 600, clientWidth: 300 });

    fixture.detectChanges();
    expect(row.getAttribute('data-scroll-more')).toBe('end');

    row.scrollLeft = 150;
    row.dispatchEvent(new Event('scroll'));
    expect(row.getAttribute('data-scroll-more')).toBe('both');

    row.scrollLeft = 300;
    row.dispatchEvent(new Event('scroll'));
    expect(row.getAttribute('data-scroll-more')).toBe('start');
  });

  it('stops listening when it is destroyed', () => {
    const fixture = TestBed.createComponent(Host);
    const row = fixture.nativeElement.querySelector('.row') as HTMLElement;
    metrics(row, { scrollWidth: 600, clientWidth: 300 });
    fixture.detectChanges();
    fixture.destroy();

    row.scrollLeft = 150;
    row.dispatchEvent(new Event('scroll'));

    expect(row.getAttribute('data-scroll-more')).toBe('end');
  });
});
