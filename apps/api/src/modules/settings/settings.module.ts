import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { LlmSettingsController } from './llm-settings.controller.js';
import { LlmSettingsService } from './llm-settings.service.js';

/** The instance's own settings (Roadmap GAP-39a); today only the LLM configuration. */
@Module({
  imports: [AuthModule, LlmModule],
  controllers: [LlmSettingsController],
  providers: [LlmSettingsService],
  exports: [LlmSettingsService],
})
export class SettingsModule {}
