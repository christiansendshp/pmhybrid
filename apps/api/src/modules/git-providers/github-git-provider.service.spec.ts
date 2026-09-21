import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnvConfig } from '../../config/env.validation.js';
import { GitHubGitProvider } from './github-git-provider.service.js';

function config(token: string) {
  return {
    get: (key: string) => (key === 'GITHUB_TOKEN' ? token : undefined),
  } as unknown as ConfigService<EnvConfig, true>;
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('GitHubGitProvider (Roadmap GAP-23)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fails fast in the constructor when GITHUB_TOKEN is blank', () => {
    expect(() => new GitHubGitProvider(config(''))).toThrow(/GITHUB_TOKEN/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('readFile decodes the base64 contents payload', async () => {
    const provider = new GitHubGitProvider(config('gh_token'));
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        content: Buffer.from('# Roadmap\n', 'utf-8').toString('base64'),
        encoding: 'base64',
        sha: 'abc123',
      }),
    );

    const content = await provider.readFile(
      'octocat/hello-world/docs',
      'Roadmap.md',
    );

    expect(content).toBe('# Roadmap\n');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/octocat/hello-world/contents/docs/Roadmap.md',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer gh_token' }),
      }),
    );
  });

  it('readFile throws a descriptive error on a 404, with no token in the message', async () => {
    const provider = new GitHubGitProvider(config('gh_token'));
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { message: 'Not Found' }),
    );

    const message = await provider
      .readFile('octocat/hello-world', 'Missing.md')
      .then(
        () => {
          throw new Error('expected readFile to reject');
        },
        (error: Error) => error.message,
      );
    expect(message).toContain('status 404');
    expect(message).not.toContain('gh_token');
  });

  it('writeFile creates a new file (no sha) when none exists yet', async () => {
    const provider = new GitHubGitProvider(config('gh_token'));
    fetchMock
      .mockResolvedValueOnce(jsonResponse(404, { message: 'Not Found' }))
      .mockResolvedValueOnce(jsonResponse(201, {}));

    await provider.writeFile('octocat/hello-world', 'Roadmap.md', '# New\n');

    const putCall = fetchMock.mock.calls[1];
    const putBody = JSON.parse((putCall[1] as RequestInit).body as string);
    expect(putBody.sha).toBeUndefined();
    expect(Buffer.from(putBody.content, 'base64').toString('utf-8')).toBe(
      '# New\n',
    );
  });

  it('writeFile updates an existing file using its current sha', async () => {
    const provider = new GitHubGitProvider(config('gh_token'));
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          content: '',
          encoding: 'base64',
          sha: 'existing-sha',
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, {}));

    await provider.writeFile(
      'octocat/hello-world',
      'Roadmap.md',
      '# Updated\n',
    );

    const putCall = fetchMock.mock.calls[1];
    const putBody = JSON.parse((putCall[1] as RequestInit).body as string);
    expect(putBody.sha).toBe('existing-sha');
  });

  it('writeFile throws on a 409 (stale sha) rather than retrying', async () => {
    const provider = new GitHubGitProvider(config('gh_token'));
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, { content: '', encoding: 'base64', sha: 'stale' }),
      )
      .mockResolvedValueOnce(jsonResponse(409, { message: 'Conflict' }));

    await expect(
      provider.writeFile('octocat/hello-world', 'Roadmap.md', '# X\n'),
    ).rejects.toThrow(/status 409/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('listRevisions maps commits to hash + capturedAt', async () => {
    const provider = new GitHubGitProvider(config('gh_token'));
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, [
        {
          sha: 'h1',
          commit: { committer: { date: '2026-09-18T10:00:00Z' }, author: null },
        },
        {
          sha: 'h2',
          commit: { committer: null, author: { date: '2026-09-17T10:00:00Z' } },
        },
      ]),
    );

    const revisions = await provider.listRevisions(
      'octocat/hello-world',
      'Roadmap.md',
    );

    expect(revisions).toEqual([
      { hash: 'h1', capturedAt: new Date('2026-09-18T10:00:00Z') },
      { hash: 'h2', capturedAt: new Date('2026-09-17T10:00:00Z') },
    ]);
  });

  it('listRevisions swallows errors and returns an empty list, matching LocalFsGitProvider', async () => {
    const provider = new GitHubGitProvider(config('gh_token'));
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    await expect(
      provider.listRevisions('octocat/hello-world', 'Roadmap.md'),
    ).resolves.toEqual([]);
  });

  it('rejects a docsPath with fewer than two segments', async () => {
    const provider = new GitHubGitProvider(config('gh_token'));
    await expect(provider.readFile('just-owner', 'Roadmap.md')).rejects.toThrow(
      /owner\/repo/,
    );
  });

  describe('readRootRulesFile (Roadmap GAP-37c)', () => {
    const ok = (text: string) =>
      jsonResponse(200, {
        content: Buffer.from(text, 'utf-8').toString('base64'),
        encoding: 'base64',
        sha: 'abc',
      });
    const requested = () => fetchMock.mock.calls.map((call) => String(call[0]));

    it('reads AGENTS.md one level above the docs folder', async () => {
      const provider = new GitHubGitProvider(config('gh_token'));
      fetchMock.mockResolvedValueOnce(ok('# Rules'));

      expect(await provider.readRootRulesFile('octocat/hello-world/docs')).toBe(
        '# Rules',
      );
      expect(requested()).toEqual([
        'https://api.github.com/repos/octocat/hello-world/contents/AGENTS.md',
      ]);
    });

    it('keeps the rest of a nested sub-path, and reads the repository root when there is no sub-path', async () => {
      const provider = new GitHubGitProvider(config('gh_token'));
      fetchMock.mockResolvedValue(ok('# Rules'));

      await provider.readRootRulesFile('octocat/hello-world/apps/site/docs');
      await provider.readRootRulesFile('octocat/hello-world');

      expect(requested()).toEqual([
        'https://api.github.com/repos/octocat/hello-world/contents/apps/site/AGENTS.md',
        'https://api.github.com/repos/octocat/hello-world/contents/AGENTS.md',
      ]);
    });

    it('rejects when the file is not there', async () => {
      const provider = new GitHubGitProvider(config('gh_token'));
      fetchMock.mockResolvedValueOnce(
        jsonResponse(404, { message: 'Not Found' }),
      );

      await expect(
        provider.readRootRulesFile('octocat/hello-world/docs'),
      ).rejects.toThrow(/status 404/);
    });
  });
});
