import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GitProvidersModule } from '../git-providers/git-providers.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({
  imports: [AuthModule, GitProvidersModule, TasksModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
