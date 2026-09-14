/**
 * Decoupling seam (brief §20, docs/architecture.md). MVP ships only
 * LocalFsGitProvider; GitHub/GitLab/Bitbucket providers are additive later
 * without touching callers.
 */
export interface FileRevisionInfo {
  hash: string;
  capturedAt: Date;
}

export interface ProjectRepositoryProvider {
  readFile(docsPath: string, relativePath: string): Promise<string>;
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
