import { Module } from '@nestjs/common';
import { EpicsController } from './epics.controller.js';
import { EpicsService } from './epics.service.js';

@Module({
  controllers: [EpicsController],
  providers: [EpicsService],
  exports: [EpicsService],
})
export class EpicsModule {}
