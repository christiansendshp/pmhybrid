import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { TitleNormalizationController } from './title-normalization.controller.js';
import { TitleNormalizationService } from './title-normalization.service.js';
import { TitleNormalizer } from './title-normalizer.service.js';

/** Normalization of long Roadmap titles with an LLM (Roadmap GAP-39). */
@Module({
  imports: [AuthModule, LlmModule, SettingsModule],
  controllers: [TitleNormalizationController],
  providers: [TitleNormalizer, TitleNormalizationService],
  exports: [TitleNormalizer, TitleNormalizationService],
})
export class TitleNormalizationModule {}
