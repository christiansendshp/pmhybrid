import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.validation.js';
import { AuthModule } from '../auth/auth.module.js';
import { FilesystemBrowserController } from './filesystem-browser.controller.js';
import { FilesystemBrowserService } from './filesystem-browser.service.js';
import { GitHubGitProvider } from './github-git-provider.service.js';
import { LocalFsGitProvider } from './local-fs-git-provider.service.js';
import { PROJECT_REPOSITORY_PROVIDER } from './project-repository-provider.interface.js';

/**
 * GIT_PROVIDER_TYPE picks the provider for the whole process (Roadmap
 * GAP-23) — not per-project, matching the ticket's own acceptance wording.
 * Built with `new` inside the factory rather than Nest's `providers` array
 * so only the selected implementation is ever constructed: GitHubGitProvider
 * fails fast in its constructor when GITHUB_TOKEN is blank, and that check
 * must not run for the (default) local deployments that never set it.
 */
@Module({
  imports: [AuthModule],
  controllers: [FilesystemBrowserController],
  providers: [
    FilesystemBrowserService,
    {
      provide: PROJECT_REPOSITORY_PROVIDER,
      useFactory: (configService: ConfigService<EnvConfig, true>) =>
        configService.get('GIT_PROVIDER_TYPE', { infer: true }) === 'github'
          ? new GitHubGitProvider(configService)
          : new LocalFsGitProvider(configService),
      inject: [ConfigService],
    },
  ],
  exports: [PROJECT_REPOSITORY_PROVIDER],
})
export class GitProvidersModule {}
