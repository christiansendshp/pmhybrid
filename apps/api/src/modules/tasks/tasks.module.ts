import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SynchronizationModule } from '../synchronization/synchronization.module.js';
import { ProgressController } from './progress.controller.js';
import { ProgressRollupService } from './progress-rollup.service.js';
import { TaskCommentsController } from './task-comments.controller.js';
import { TaskCommentsService } from './task-comments.service.js';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

@Module({
  imports: [AuthModule, SynchronizationModule],
  controllers: [TasksController, ProgressController, TaskCommentsController],
  providers: [TasksService, ProgressRollupService, TaskCommentsService],
  exports: [TasksService, ProgressRollupService, TaskCommentsService],
})
export class TasksModule {}
