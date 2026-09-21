import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMPACT_QUERY, Viewport } from './viewport.js';

function fakeMatchMedia(matches: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const list = {
    matches,
    addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) =>
      listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) =>
      listeners.delete(listener),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => list),
  );
  return {
    listeners,
    resize(next: boolean) {
      list.matches = next;
      listeners.forEach((listener) => listener({ matches: next }));
    },
  };
}

describe('Viewport (Roadmap UX-02b)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is compact on a narrow window and follows it as it is resized', () => {
    const media = fakeMatchMedia(true);
    const viewport = TestBed.inject(Viewport);

    expect(matchMedia).toHaveBeenCalledWith(COMPACT_QUERY);
    expect(viewport.compact()).toBe(true);

    media.resize(false);
    expect(viewport.compact()).toBe(false);
  });

  it('stops listening when it is destroyed', () => {
    const media = fakeMatchMedia(false);
    TestBed.inject(Viewport);
    expect(media.listeners.size).toBe(1);

    TestBed.resetTestingModule();

    expect(media.listeners.size).toBe(0);
  });

  it('is not compact where the window cannot say', () => {
    vi.stubGlobal('matchMedia', undefined);

    expect(TestBed.inject(Viewport).compact()).toBe(false);
  });
});
