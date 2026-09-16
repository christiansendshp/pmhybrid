import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeService } from './theme.service.js';

function mockMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockReturnValue({ matches } as MediaQueryList),
  });
}

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.colorScheme = '';
    TestBed.configureTestingModule({});
  });

  it('follows the OS preference when nothing was chosen before', () => {
    mockMatchMedia(true);

    const service = TestBed.inject(ThemeService);
    TestBed.tick();

    expect(service.mode()).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('defaults to light when the OS has no dark preference', () => {
    mockMatchMedia(false);

    const service = TestBed.inject(ThemeService);
    TestBed.tick();

    expect(service.mode()).toBe('light');
  });

  it('toggle() flips the mode and persists it, overriding the OS preference on the next load', () => {
    mockMatchMedia(false);
    const service = TestBed.inject(ThemeService);
    TestBed.tick();

    service.toggle();
    TestBed.tick();

    expect(service.mode()).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(localStorage.getItem('pmhybrid.theme')).toBe('dark');

    service.toggle();
    TestBed.tick();

    expect(service.mode()).toBe('light');
    expect(localStorage.getItem('pmhybrid.theme')).toBe('light');
  });

  it('reads a previously stored choice instead of the OS preference', () => {
    localStorage.setItem('pmhybrid.theme', 'dark');
    mockMatchMedia(false);

    const service = TestBed.inject(ThemeService);
    TestBed.tick();

    expect(service.mode()).toBe('dark');
  });
});
