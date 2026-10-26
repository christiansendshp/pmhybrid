import { describe, expect, it } from 'vitest';
import { ledgerWordRows, type LedgerWordGroup } from './ledger-words.util.js';

const group = (
  statusWord: string,
  canonicalStatus: string | null,
  entries: number,
  statusQualifier: string | null = null,
): LedgerWordGroup => ({
  statusWord,
  canonicalStatus,
  _count: { _all: entries },
  _max: { statusQualifier },
});

describe('ledgerWordRows (Roadmap TASK-30)', () => {
  it('gives each word its status, how many entries carry it and an example qualifier', () => {
    expect(
      ledgerWordRows([
        group('DONE (chunk 1/2)', 'DONE_PARTIAL', 3, 'chunk 1/2'),
      ]),
    ).toEqual([
      {
        word: 'DONE (chunk 1/2)',
        canonicalStatus: 'DONE_PARTIAL',
        entries: 3,
        qualifier: 'chunk 1/2',
      },
    ]);
  });

  it('puts the words the table does not know first, the most used among them first', () => {
    const words = ledgerWordRows([
      group('DONE', 'DONE', 500),
      group('N/A', 'OTHER', 2),
      group('EN CURSO', 'OTHER', 9),
    ]).map((row) => row.word);

    expect(words).toEqual(['EN CURSO', 'N/A', 'DONE']);
  });

  it('puts an entry not classified yet right after the unknown words, before the known ones', () => {
    const words = ledgerWordRows([
      group('DONE', 'DONE', 500),
      group('FRESH', null, 1),
      group('N/A', 'OTHER', 1),
    ]).map((row) => row.word);

    expect(words).toEqual(['N/A', 'FRESH', 'DONE']);
  });

  it('orders the known words by entries, then alphabetically among equals', () => {
    const words = ledgerWordRows([
      group('PAUSE', 'PAUSE', 4),
      group('BLOQUEADO', 'BLOCKED', 4),
      group('DONE', 'DONE', 10),
    ]).map((row) => row.word);

    expect(words).toEqual(['DONE', 'BLOQUEADO', 'PAUSE']);
  });

  it('is empty for a ledger with no entries', () => {
    expect(ledgerWordRows([])).toEqual([]);
  });
});
