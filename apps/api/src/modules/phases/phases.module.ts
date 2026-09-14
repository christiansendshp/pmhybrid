import { Module } from '@nestjs/common';
import { PhasesController } from './phases.controller.js';
import { PhasesService } from './phases.service.js';

@Module({
  controllers: [PhasesController],
  providers: [PhasesService],
  exports: [PhasesService],
})
export class PhasesModule {}
