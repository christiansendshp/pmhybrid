import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The code and the documents of this repository cite decisions by id
 * (`ADR-002`), and the decision table says to link the long record from
 * `docs/decisions/`. A cited id with no file there, or a file the table does
 * not list, is a reference that leads nowhere (Roadmap IMPROVEMENT-02a).
 */
describe("this repository's docs/decisions", () => {
  const docs = new URL('../../../../../docs/', import.meta.url);
  const stack = readFileSync(new URL('Stack_Tecnologies.md', docs), 'utf-8');
  const tableIds = [...stack.matchAll(/^\| (ADR-\d{3}) /gm)].map(
    (match) => match[1],
  );
  const files = readdirSync(new URL('decisions/', docs)).filter((name) =>
    /^ADR-\d{3}-.+\.md$/.test(name),
  );
  const fileIds = files.map((name) => name.slice(0, 7));

  it('has a file for every decision the table lists, and no other', () => {
    expect(tableIds.length).toBeGreaterThan(0);
    expect([...fileIds].sort()).toEqual([...tableIds].sort());
  });

  it('says in each file what the table says of it', () => {
    for (const name of files) {
      const id = name.slice(0, 7);
      const row = stack
        .split('\n')
        .find((line) => line.startsWith(`| ${id} `))!;
      const record = readFileSync(new URL(`decisions/${name}`, docs), 'utf-8');
      // The decision is the third cell of the row, verbatim.
      const decision = row.split('|')[3].trim();
      expect(record, name).toContain(decision.replace(/\s+/g, ' '));
      expect(record.split('\n')[0], name).toMatch(new RegExp(`^# ${id} — `));
    }
  });

  it('lists every file in its index', () => {
    const index = readFileSync(new URL('decisions/README.md', docs), 'utf-8');
    for (const name of files) {
      expect(index, name).toContain(`(${name})`);
    }
  });

  it('has a record for every decision the code and the docs cite', () => {
    const cited = new Set<string>();
    for (const path of [
      'Roadmap.md',
      'Stack_Tecnologies.md',
      'domain-model.md',
      'synchronization.md',
      'roadmap-parser.md',
      'permissions.md',
      'architecture.md',
    ]) {
      const text = readFileSync(new URL(path, docs), 'utf-8');
      for (const match of text.matchAll(/ADR-\d{3}/g)) {
        cited.add(match[0]);
      }
    }
    expect([...cited].filter((id) => !fileIds.includes(id))).toEqual([]);
  });
});
