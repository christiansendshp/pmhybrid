/**
 * Decoupling seam (brief §20, docs/architecture.md). MVP ships only
 * LocalFsGitProvider; GitHub/GitLab/Bitbucket providers are additive later
 * without touching callers.
 */
/** The rules file the project-documentation skill keeps at the repository root. */
export const ROOT_RULES_FILENAME = 'AGENTS.md';

export interface FileRevisionInfo {
  hash: string;
  capturedAt: Date;
}

export interface ProjectRepositoryProvider {
  readFile(docsPath: string, relativePath: string): Promise<string>;
  /**
   * The repository-root `AGENTS.md` of the project whose documents live at
   * `docsPath` (the project-documentation skill keeps its rules there, not in
   * the docs folder). It takes no file name on purpose: this is the only file
   * reachable outside the docs folder, so there is no path to traverse
   * (Roadmap GAP-37c). Rejects when there is no such file.
   */
  readRootRulesFile(docsPath: string): Promise<string>;
  /**
   * Makes sure the docs folder exists and holds each of these files (name ->
   * content), creating the folder and only the files that are missing — a file
   * that is already there is never touched (Roadmap GAP-36a). Returns the
   * names it created. A remote provider, where creating a file is a commit,
   * creates nothing and returns [].
   */
  ensureDocuments(
    docsPath: string,
    files: Readonly<Record<string, string>>,
  ): Promise<string[]>;
  writeFile(
    docsPath: string,
    relativePath: string,
    content: string,
  ): Promise<void>;
  listRevisions(
    docsPath: string,
    relativePath: string,
  ): Promise<FileRevisionInfo[]>;
}

export const PROJECT_REPOSITORY_PROVIDER = 'PROJECT_REPOSITORY_PROVIDER';
