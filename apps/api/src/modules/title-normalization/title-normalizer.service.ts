import { Injectable } from '@nestjs/common';
import { LlmClient } from '../llm/llm-client.service.js';
import {
  LlmProviderError,
  type LlmErrorKind,
  type LlmRequest,
  type LlmRuntimeConfig,
} from '../llm/llm.types.js';
import {
  buildUserMessage,
  correctiveMessage,
  sourceTextOf,
  SYSTEM_PROMPT,
  type NormalizationSource,
} from './title-prompt.js';
import { checkAnswer } from './title-validation.util.js';
import {
  MAX_TITLE_WORDS,
  needsNormalization,
  truncateToWords,
} from './word-count.util.js';

export type NormalizationFailureKind = LlmErrorKind | 'INVALID_RESPONSE';

export type NormalizationOutcome =
  /** The title has 10 words or fewer: kept, and the LLM was not called. */
  | { status: 'SKIPPED' }
  | {
      status: 'NORMALIZED';
      title: string;
      description: string;
      /** The title had to be cut locally to 10 words after the model's second try was still too long. */
      truncatedLocally: boolean;
    }
  /** The task stays as it was; `message` is free of the API key and safe to store. */
  | {
      status: 'FAILED';
      kind: NormalizationFailureKind;
      message: string;
    };

/**
 * Turns the title of a task that has more than 10 words into one of at most 10
 * plus an extended description (Roadmap GAP-39c). It never throws: whatever
 * goes wrong is an outcome the caller records, because the LLM must never be
 * able to stop the processing of a Roadmap.
 *
 * One corrective retry: when the answer is not usable (not JSON, a title over
 * 10 words, a title about something else, an invented identifier) the model is
 * told what was wrong and asked again. If the title is still the only thing
 * wrong, it is cut locally to its first 10 words and the description is kept;
 * anything else ends as `INVALID_RESPONSE` and the task is left alone.
 */
@Injectable()
export class TitleNormalizer {
  constructor(private readonly llm: LlmClient) {}

  async normalize(
    config: LlmRuntimeConfig,
    source: NormalizationSource,
  ): Promise<NormalizationOutcome> {
    if (!needsNormalization(source.title)) {
      return { status: 'SKIPPED' };
    }
    const sourceText = sourceTextOf(source);
    const request: LlmRequest = {
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(source) }],
    };
    try {
      const first = await this.llm.complete(config, request);
      const firstCheck = checkAnswer(first, sourceText);
      if (firstCheck.ok) {
        return {
          status: 'NORMALIZED',
          ...firstCheck.value,
          truncatedLocally: false,
        };
      }

      const second = await this.llm.complete(config, {
        system: SYSTEM_PROMPT,
        messages: [
          ...request.messages,
          { role: 'assistant', content: first },
          { role: 'user', content: correctiveMessage(firstCheck.problems) },
        ],
      });
      const secondCheck = checkAnswer(second, sourceText);
      if (secondCheck.ok) {
        return {
          status: 'NORMALIZED',
          ...secondCheck.value,
          truncatedLocally: false,
        };
      }
      if (secondCheck.salvage) {
        return {
          status: 'NORMALIZED',
          title: truncateToWords(secondCheck.salvage.title, MAX_TITLE_WORDS),
          description: secondCheck.salvage.description,
          truncatedLocally: true,
        };
      }
      return {
        status: 'FAILED',
        kind: 'INVALID_RESPONSE',
        message: `The LLM's answer was not usable (${secondCheck.problems
          .map((problem) => problem.code)
          .join(', ')})`,
      };
    } catch (error) {
      if (error instanceof LlmProviderError) {
        return { status: 'FAILED', kind: error.kind, message: error.message };
      }
      return {
        status: 'FAILED',
        kind: 'PROVIDER',
        message: 'The normalization failed unexpectedly',
      };
    }
  }
}
