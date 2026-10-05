import { Module } from '@nestjs/common';
import { LlmClient } from './llm-client.service.js';
import { LLM_FETCH, type FetchLike } from './llm.types.js';

/**
 * Under a test runner nothing may reach a real provider: specs run in parallel
 * against one database, so one that configures the LLM would otherwise let the
 * app of another spec call the real API. A test that wants an answer overrides
 * `LLM_FETCH`; any other gets a network failure, which is an outcome like any
 * other (Roadmap GAP-39d).
 */
const refuseUnderTest: FetchLike = () =>
  Promise.reject(new Error('No network under test'));

/** The calls out to an LLM provider (Roadmap GAP-39c). `LLM_FETCH` is the global `fetch`; a test overrides it to answer for the provider. */
@Module({
  providers: [
    {
      provide: LLM_FETCH,
      useFactory: (): FetchLike =>
        process.env.NODE_ENV === 'test'
          ? refuseUnderTest
          : globalThis.fetch.bind(globalThis),
    },
    LlmClient,
  ],
  exports: [LlmClient, LLM_FETCH],
})
export class LlmModule {}
