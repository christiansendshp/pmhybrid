import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module.js';
import { TitleNormalizer } from './title-normalizer.service.js';

/** Normalization of long Roadmap titles with an LLM (Roadmap GAP-39). */
@Module({
  imports: [LlmModule],
  providers: [TitleNormalizer],
  exports: [TitleNormalizer],
})
export class TitleNormalizationModule {}
