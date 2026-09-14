import { NotFoundException } from '@nestjs/common';

/** URL-friendly kind -> the skill's exact filename under a project's docsPath. */
const FILENAMES: Record<string, string> = {
  roadmap: 'Roadmap.md',
  agentslog: 'Agentslog.md',
  'product-description': 'ProductDescription.md',
  'stack-tech': 'Stack_Tecnologies.md',
  features: 'Features.md',
  'agents-rules': 'Agents.md',
};

export function resolveDocumentFilename(kind: string): string {
  const filename = FILENAMES[kind];
  if (!filename) {
    throw new NotFoundException(`Unknown document kind: ${kind}`);
  }
  return filename;
}

export const DOCUMENT_KINDS = Object.keys(FILENAMES);
