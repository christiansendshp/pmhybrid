import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProgressController } from './progress.controller.js';
import { ProgressRollupService } from './progress-rollup.service.js';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

@Module({
  imports: [AuthModule],
  controllers: [TasksController, ProgressController],
  providers: [TasksService, ProgressRollupService],
  exports: [TasksService, ProgressRollupService],
})
export class TasksModule {}
