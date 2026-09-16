import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FilesystemBrowserController } from './filesystem-browser.controller.js';
import { FilesystemBrowserService } from './filesystem-browser.service.js';
import { LocalFsGitProvider } from './local-fs-git-provider.service.js';
import { PROJECT_REPOSITORY_PROVIDER } from './project-repository-provider.interface.js';

@Module({
  imports: [AuthModule],
  controllers: [FilesystemBrowserController],
  providers: [
    LocalFsGitProvider,
    FilesystemBrowserService,
    {
      provide: PROJECT_REPOSITORY_PROVIDER,
      useClass: LocalFsGitProvider,
    },
  ],
  exports: [PROJECT_REPOSITORY_PROVIDER],
})
export class GitProvidersModule {}
