import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.validation.js';
import {
  parseAllowedRoots,
  resolveAllowedLocalDocsPath,
} from './docs-path-policy.js';
import {
  FileRevisionInfo,
  ProjectRepositoryProvider,
  ROOT_RULES_FILENAME,
} from './project-repository-provider.interface.js';

const execFileAsync = promisify(execFile);

/**
 * MVP implementation of ProjectRepositoryProvider: reads/writes a managed
 * project's own checked-out working tree on the local filesystem, and lists
 * revisions via `git log` against that same working tree (brief §20 —
 * "MVP puede comenzar con repositorios Git y archivos Markdown").
 *
 * Every operation re-checks that `docsPath` still sits inside an allowed
 * root (Roadmap SECURITY-01), not only when a project is created: a row
 * stored before the confinement existed, or under a since-narrowed
 * `PROJECT_DOCS_BROWSE_ROOT`, must not become a way to read or write
 * arbitrary folders.
 */
@Injectable()
export class LocalFsGitProvider implements ProjectRepositoryProvider {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  private allowedDocsPath(docsPath: string): Promise<string> {
    return resolveAllowedLocalDocsPath(
      docsPath,
      parseAllowedRoots(
        this.config.get('PROJECT_DOCS_BROWSE_ROOT', { infer: true }),
      ),
    );
  }

  async readFile(docsPath: string, relativePath: string): Promise<string> {
    const base = await this.allowedDocsPath(docsPath);
    return fs.readFile(path.join(base, relativePath), 'utf-8');
  }

  /**
   * The parent of the docs folder is checked against the allowed roots like
   * the folder itself, so a docs folder that is a root has no readable parent
   * and nothing outside the roots becomes reachable (Roadmap GAP-37c).
   */
  async readRootRulesFile(docsPath: string): Promise<string> {
    const base = await this.allowedDocsPath(docsPath);
    const root = await resolveAllowedLocalDocsPath(
      path.dirname(base),
      parseAllowedRoots(
        this.config.get('PROJECT_DOCS_BROWSE_ROOT', { infer: true }),
      ),
    );
    return fs.readFile(path.join(root, ROOT_RULES_FILENAME), 'utf-8');
  }

  async writeFile(
    docsPath: string,
    relativePath: string,
    content: string,
  ): Promise<void> {
    const base = await this.allowedDocsPath(docsPath);
    await fs.writeFile(path.join(base, relativePath), content, 'utf-8');
  }

  async listRevisions(
    docsPath: string,
    relativePath: string,
  ): Promise<FileRevisionInfo[]> {
    try {
      const base = await this.allowedDocsPath(docsPath);
      const { stdout } = await execFileAsync(
        'git',
        ['log', '--follow', '--format=%H|%cI', '--', relativePath],
        { cwd: base },
      );
      return stdout
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          const [hash, isoDate] = line.split('|');
          return { hash, capturedAt: new Date(isoDate) };
        });
    } catch {
      // Not a git repo, the file has no history yet, or the path is outside
      // the allowed roots — none of them fatal for MVP.
      return [];
    }
  }
}
