import { describe, expect, it } from 'vitest';
import {
  DEV_CORS_ORIGINS,
  isOriginAllowed,
  parseCorsOrigins,
} from './http-hardening.js';

describe('parseCorsOrigins (Roadmap SECURITY-04b1)', () => {
  it("gives development the web app's own origins and production none until it is told", () => {
    expect(parseCorsOrigins(undefined, false)).toEqual(DEV_CORS_ORIGINS);
    expect(parseCorsOrigins('  ', false)).toEqual(DEV_CORS_ORIGINS);
    expect(parseCorsOrigins(undefined, true)).toEqual([]);
  });

  it('takes a comma-separated list, trimmed, without trailing slashes', () => {
    expect(
      parseCorsOrigins(
        ' https://a.example.com/ , https://b.example.com ,, ',
        true,
      ),
    ).toEqual(['https://a.example.com', 'https://b.example.com']);
  });

  it('lets a deployment name an origin in production, and only that', () => {
    expect(parseCorsOrigins('https://pm.example.com', true)).toEqual([
      'https://pm.example.com',
    ]);
  });
});

describe('isOriginAllowed (Roadmap SECURITY-04b1)', () => {
  const allowed = ['https://pm.example.com'];

  it('allows a listed origin and refuses any other, exactly', () => {
    expect(isOriginAllowed('https://pm.example.com', allowed)).toBe(true);
    expect(isOriginAllowed('https://pm.example.com.evil.org', allowed)).toBe(
      false,
    );
    expect(isOriginAllowed('http://pm.example.com', allowed)).toBe(false);
  });

  it('has nothing to decide for a request without an Origin (not a browser)', () => {
    expect(isOriginAllowed(undefined, allowed)).toBe(true);
    expect(isOriginAllowed(undefined, [])).toBe(true);
  });

  it('allows every origin only when "*" is listed on purpose', () => {
    expect(isOriginAllowed('https://anywhere.example', ['*'])).toBe(true);
    expect(isOriginAllowed('https://anywhere.example', [])).toBe(false);
  });
});
