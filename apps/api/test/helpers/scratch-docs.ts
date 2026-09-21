import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SKELETON_ROADMAP = `# Roadmap

## Active work

| ID | Outcome | Acceptance check | Status | Owner | Depends on |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — |

## Near term

| ID | Outcome | Acceptance check | Status | Depends on |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |

## Blocked

| ID | Blocker | Needed decision or event | Owner |
| --- | --- | --- | --- |
| — | — | — | — |
`;

const SKELETON_AGENTSLOG = `# Agents log

## Entries
`;

/**
 * A real, writable docs directory outside the repo (an OS temp dir, unique
 * per call) — never `pmhybrid-self` or a committed fixture, since write-back
 * genuinely mutates Roadmap.md/Agentslog.md on disk and a test must not
 * leave those mutations behind in tracked files.
 */
export function createScratchDocsPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'pmhybrid-e2e-'));
  writeFileSync(path.join(dir, 'Roadmap.md'), SKELETON_ROADMAP, 'utf-8');
  writeFileSync(path.join(dir, 'Agentslog.md'), SKELETON_AGENTSLOG, 'utf-8');
  return dir;
}

/**
 * A docsPath that is unique per call and never created on disk — for tests
 * that only need a valid, allowed value stored on a project. Fixed literals
 * like './private-docs' stopped working once creating a project on a folder
 * another project the caller is not a member of already uses became a 409
 * (Roadmap SECURITY-01), because the test database outlives each run.
 */
export function uniqueDocsPath(label: string): string {
  return path.join(tmpdir(), `pmhybrid-e2e-${label}-${randomUUID()}`);
}
