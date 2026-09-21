import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ConflictsModule } from '../conflicts/conflicts.module.js';
import { GitProvidersModule } from '../git-providers/git-providers.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { McpController } from './mcp.controller.js';

@Module({
  imports: [
    AuthModule,
    ConflictsModule,
    GitProvidersModule,
    NotificationsModule,
    ProjectsModule,
    TasksModule,
  ],
  controllers: [McpController],
})
export class McpModule {}
