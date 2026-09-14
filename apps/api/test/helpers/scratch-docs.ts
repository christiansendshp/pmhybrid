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
