import { NotFoundException } from '@nestjs/common';
import { DocumentKind } from '@prisma/client';

/** URL-friendly kind -> the skill's exact filename under a project's docsPath. */
const FILENAMES: Record<string, string> = {
  roadmap: 'Roadmap.md',
  agentslog: 'Agentslog.md',
  'product-description': 'ProductDescription.md',
  'stack-tech': 'Stack_Tecnologies.md',
  features: 'Features.md',
  'agents-rules': 'Agents.md',
};

/** URL-friendly kind -> the Prisma enum synchronization.service.ts syncs Document/DocumentRevision rows under. */
const KIND_ENUM: Record<string, DocumentKind> = {
  roadmap: 'ROADMAP',
  agentslog: 'AGENTSLOG',
  'product-description': 'PRODUCT_DESCRIPTION',
  'stack-tech': 'STACK_TECH',
  features: 'FEATURES',
  'agents-rules': 'AGENTS_RULES',
};

export function resolveDocumentFilename(kind: string): string {
  const filename = FILENAMES[kind];
  if (!filename) {
    throw new NotFoundException(`Unknown document kind: ${kind}`);
  }
  return filename;
}

export function resolveDocumentKind(kind: string): DocumentKind {
  const value = KIND_ENUM[kind];
  if (!value) {
    throw new NotFoundException(`Unknown document kind: ${kind}`);
  }
  return value;
}

export const DOCUMENT_KINDS = Object.keys(FILENAMES);
