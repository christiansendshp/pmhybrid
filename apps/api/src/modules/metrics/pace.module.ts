import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PaceController } from './pace.controller.js';
import { PaceService } from './pace.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PaceController],
  providers: [PaceService],
  exports: [PaceService],
})
export class PaceModule {}
