import { Module } from '@nestjs/common';
import { LlmClient } from './llm-client.service.js';
import { LLM_FETCH } from './llm.types.js';

/** The calls out to an LLM provider (Roadmap GAP-39c). `LLM_FETCH` is the global `fetch`; a test overrides it to answer for the provider. */
@Module({
  providers: [
    { provide: LLM_FETCH, useFactory: () => globalThis.fetch.bind(globalThis) },
    LlmClient,
  ],
  exports: [LlmClient, LLM_FETCH],
})
export class LlmModule {}
