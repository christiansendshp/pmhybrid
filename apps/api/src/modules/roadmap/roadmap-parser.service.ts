import { Injectable } from '@nestjs/common';

/**
 * FASE-03 shell. Real table-discrimination-by-column-signature and status/
 * owner-cell mapping (docs/roadmap-parser.md) land in FASE-06. Parsing only
 * — no orchestration (that's synchronization.module.ts).
 */
@Injectable()
export class RoadmapParserService {
  parse(_rawMarkdown: string): unknown[] {
    return [];
  }
}
