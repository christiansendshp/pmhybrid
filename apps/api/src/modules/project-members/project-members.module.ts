import { Module } from '@nestjs/common';
import { ProjectMembersController } from './project-members.controller.js';
import { ProjectMembersService } from './project-members.service.js';

@Module({
  controllers: [ProjectMembersController],
  providers: [ProjectMembersService],
  exports: [ProjectMembersService],
})
export class ProjectMembersModule {}
