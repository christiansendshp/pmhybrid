import { Injectable } from '@nestjs/common';

/**
 * FASE-03 shell. Real entry-regex parsing, rawEntryHash idempotency, and
 * rotation-pointer following (docs/roadmap-parser.md) land in FASE-06.
 */
@Injectable()
export class AgentslogParserService {
  parse(_rawMarkdown: string): unknown[] {
    return [];
  }
}
