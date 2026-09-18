import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { McpController } from './mcp.controller.js';

@Module({
  imports: [AuthModule, TasksModule],
  controllers: [McpController],
})
export class McpModule {}
