import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.validation.js';
import {
  FileRevisionInfo,
  ProjectRepositoryProvider,
  ROOT_RULES_FILENAME,
} from './project-repository-provider.interface.js';

const GITHUB_API_BASE = 'https://api.github.com';
const API_VERSION = '2022-11-28';

interface GitHubContentsResponse {
  content: string;
  encoding: string;
  sha: string;
}

interface GitHubCommitsResponse {
  sha: string;
  commit: {
    committer: { date: string } | null;
    author: { date: string } | null;
  };
}

/**
 * GitHubGitProvider implements ProjectRepositoryProvider (Roadmap GAP-23)
 * against the GitHub REST API v3, using the platform's global `fetch` —
 * no HTTP client dependency needed for three endpoints.
 *
 * DECISION (Roadmap GAP-23, missing definition per AGENTS.md's
 * "Autonomía ante definiciones faltantes"): the interface's readFile/
 * writeFile/listRevisions signatures take only (docsPath, relativePath) —
 * no projectId, no repoUrl — so a project's GitHub repository identity has
 * to travel inside the single `docsPath` string to keep the interface
 * untouched (the whole point of the decoupling seam, brief §20). For a
 * GIT_PROVIDER_TYPE=github project, `Project.docsPath` is therefore an
 * "owner/repo" or "owner/repo/sub/path" slug instead of a local filesystem
 * path — the leading two segments identify the repository, anything after
 * is the in-repo subpath under which Roadmap.md/Agentslog.md live.
 * `Project.repoUrl` is left purely informational (e.g. a future "view repo"
 * link) and is not read by this provider. Alternatives considered: looking
 * the owning Project up from inside the provider (would need Prisma +
 * either a projectId param the interface doesn't have, or a fragile
 * reverse-lookup by docsPath value) — rejected as needless coupling for an
 * MVP with no existing GitHub-backed project data to migrate. Revisit only
 * if a project ever needs its GitHub repo identity to change independently
 * of its docs subpath.
 *
 * writeFile does a GET-then-PUT (fetch current sha, then PUT with it) —
 * this is only safe because every write-back path in this codebase already
 * serializes per-project writes through `pg_advisory_xact_lock(hashtext(
 * projectId))` (see write-back.service.ts) before ever calling writeFile;
 * without that lock this would be a classic unguarded read-modify-write.
 * A 409 (stale sha, meaning something outside PM Hub's own lock changed the
 * file concurrently) is left to throw rather than retried — retrying here
 * would silently clobber a concurrent external edit, exactly what this
 * app's conflict-detection machinery (docs/synchronization.md) exists to
 * catch instead.
 */
@Injectable()
export class GitHubGitProvider implements ProjectRepositoryProvider {
  private readonly token: string;

  constructor(configService: ConfigService<EnvConfig, true>) {
    this.token = configService.get('GITHUB_TOKEN', { infer: true });
    if (!this.token) {
      throw new Error(
        'GIT_PROVIDER_TYPE=github requires GITHUB_TOKEN to be set',
      );
    }
  }

  async readFile(docsPath: string, relativePath: string): Promise<string> {
    const { owner, repo, path } = this.resolvePath(docsPath, relativePath);
    return this.readContents(owner, repo, path);
  }

  /** The docs folder is the last segment of the sub-path; the root is its parent (the repository root when there is no sub-path) — Roadmap GAP-37c. */
  async readRootRulesFile(docsPath: string): Promise<string> {
    const { owner, repo, path } = this.resolvePath(
      docsPath,
      ROOT_RULES_FILENAME,
    );
    const segments = path.split('/');
    if (segments.length > 1) {
      segments.splice(segments.length - 2, 1);
    }
    return this.readContents(owner, repo, segments.join('/'));
  }

  private async readContents(
    owner: string,
    repo: string,
    path: string,
  ): Promise<string> {
    const res = await this.request(
      `/repos/${owner}/${repo}/contents/${encodePath(path)}`,
    );
    if (!res.ok) {
      throw new Error(
        `GitHub: failed to read ${owner}/${repo}/${path} (status ${res.status})`,
      );
    }
    const body = (await res.json()) as GitHubContentsResponse;
    return Buffer.from(body.content, 'base64').toString('utf-8');
  }

  /** Creating a file here is a commit to someone's repository, which onboarding must not do on its own. */
  ensureDocuments(): Promise<string[]> {
    return Promise.resolve([]);
  }

  async writeFile(
    docsPath: string,
    relativePath: string,
    content: string,
  ): Promise<void> {
    const { owner, repo, path } = this.resolvePath(docsPath, relativePath);
    const existing = await this.request(
      `/repos/${owner}/${repo}/contents/${encodePath(path)}`,
    );
    const sha = existing.ok
      ? ((await existing.json()) as GitHubContentsResponse).sha
      : undefined;
    if (!existing.ok && existing.status !== 404) {
      throw new Error(
        `GitHub: failed to read current sha for ${owner}/${repo}/${path} before write (status ${existing.status})`,
      );
    }

    const res = await this.request(
      `/repos/${owner}/${repo}/contents/${encodePath(path)}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          message: `chore(docs): update ${relativePath} via PM Hub`,
          content: Buffer.from(content, 'utf-8').toString('base64'),
          ...(sha ? { sha } : {}),
        }),
      },
    );
    if (!res.ok) {
      throw new Error(
        `GitHub: failed to write ${owner}/${repo}/${path} (status ${res.status})`,
      );
    }
  }

  async listRevisions(
    docsPath: string,
    relativePath: string,
  ): Promise<FileRevisionInfo[]> {
    try {
      const { owner, repo, path } = this.resolvePath(docsPath, relativePath);
      const res = await this.request(
        `/repos/${owner}/${repo}/commits?path=${encodePath(path)}`,
      );
      if (!res.ok) {
        return [];
      }
      const commits = (await res.json()) as GitHubCommitsResponse[];
      return commits.map((commit) => ({
        hash: commit.sha,
        capturedAt: new Date(
          commit.commit.committer?.date ?? commit.commit.author?.date ?? 0,
        ),
      }));
    } catch {
      // Not reachable, repo/path doesn't exist, or a network error — not
      // fatal for MVP, matching LocalFsGitProvider's behavior.
      return [];
    }
  }

  private resolvePath(
    docsPath: string,
    relativePath: string,
  ): { owner: string; repo: string; path: string } {
    const segments = docsPath
      .split('/')
      .filter((segment) => segment.length > 0);
    const [owner, repo, ...subpath] = segments;
    if (!owner || !repo) {
      throw new Error(
        `GitHub: docsPath "${docsPath}" must be "owner/repo" or "owner/repo/subpath"`,
      );
    }
    const path = [...subpath, relativePath].join('/');
    return { owner, repo, path };
  }

  private request(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${GITHUB_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': API_VERSION,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  }
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}
