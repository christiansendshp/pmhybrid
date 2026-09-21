import type { ProjectRepositoryProvider } from './project-repository-provider.interface.js';
import { ROOT_RULES_FILENAME } from './project-repository-provider.interface.js';

/** The rules document of the skill's older layout, inside the docs folder. */
export const DOCS_RULES_FILENAME = 'Agents.md';

/**
 * The project's rules document (Roadmap GAP-37c): `docs/Agents.md` when there
 * is one, so a project on the older layout keeps showing what it always did,
 * else the repository-root `AGENTS.md` where the latest skill keeps it. Rejects
 * (with the root file's error) when neither exists.
 */
export async function readRulesDocument(
  provider: ProjectRepositoryProvider,
  docsPath: string,
): Promise<{ content: string; filePath: string }> {
  try {
    return {
      content: await provider.readFile(docsPath, DOCS_RULES_FILENAME),
      filePath: DOCS_RULES_FILENAME,
    };
  } catch {
    return {
      content: await provider.readRootRulesFile(docsPath),
      filePath: ROOT_RULES_FILENAME,
    };
  }
}
