import { describe, expect, it } from 'vitest';
import {
  isDedicatedTestDatabase,
  LOCAL_TEST_DATABASE_URL,
} from './test-database.js';

describe('the dedicated e2e database (Roadmap TEST-01a)', () => {
  it('recognizes the local test database and nothing else', () => {
    expect(isDedicatedTestDatabase(LOCAL_TEST_DATABASE_URL)).toBe(true);
    expect(
      isDedicatedTestDatabase('postgresql://u:p@host:5432/pmhybrid_test'),
    ).toBe(true);
  });

  it('refuses the dev database, lookalikes and anything unparseable', () => {
    for (const url of [
      'postgresql://pmhybrid:pmhybrid@localhost:5436/pmhybrid?schema=public',
      'postgresql://u:p@host:5432/pmhybrid_test_backup',
      'postgresql://u:p@host:5432/prod_pmhybrid_test',
      'postgresql://u:p@host:5432/',
      'not a url',
      '',
    ]) {
      expect(isDedicatedTestDatabase(url)).toBe(false);
    }
  });
});
