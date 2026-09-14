import { Module } from '@nestjs/common';
import { ConflictsController } from './conflicts.controller.js';
import { ConflictsService } from './conflicts.service.js';

@Module({
  controllers: [ConflictsController],
  providers: [ConflictsService],
  exports: [ConflictsService],
})
export class ConflictsModule {}
