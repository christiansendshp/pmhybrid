import { describe, expect, it } from 'vitest';
import { DEFAULT_API_BASE_URL, readApiBaseUrl } from './api-base-url.js';

describe('readApiBaseUrl (Roadmap IMPROVEMENT-02b)', () => {
  it('is the development address when the deployment says nothing', () => {
    expect(readApiBaseUrl(undefined)).toBe(DEFAULT_API_BASE_URL);
    expect(readApiBaseUrl({})).toBe(DEFAULT_API_BASE_URL);
    expect(readApiBaseUrl({ apiBaseUrl: '' })).toBe(DEFAULT_API_BASE_URL);
    expect(readApiBaseUrl({ apiBaseUrl: '   ' })).toBe(DEFAULT_API_BASE_URL);
  });

  it('is what the deployment says', () => {
    expect(readApiBaseUrl({ apiBaseUrl: 'https://api.pm.example.com' })).toBe(
      'https://api.pm.example.com',
    );
  });

  it('ends without a slash, so a path can be appended to it', () => {
    expect(readApiBaseUrl({ apiBaseUrl: 'https://api.pm.example.com/' })).toBe(
      'https://api.pm.example.com',
    );
    expect(readApiBaseUrl({ apiBaseUrl: ' https://pm.example.com/api/// ' })).toBe(
      'https://pm.example.com/api',
    );
  });
});
