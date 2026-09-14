import { Module } from '@nestjs/common';
import { LocalFsGitProvider } from './local-fs-git-provider.service.js';
import { PROJECT_REPOSITORY_PROVIDER } from './project-repository-provider.interface.js';

@Module({
  providers: [
    LocalFsGitProvider,
    {
      provide: PROJECT_REPOSITORY_PROVIDER,
      useClass: LocalFsGitProvider,
    },
  ],
  exports: [PROJECT_REPOSITORY_PROVIDER],
})
export class GitProvidersModule {}
