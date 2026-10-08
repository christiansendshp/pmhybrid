/**
 * The 10-word rule for titles (Roadmap GAP-39) is defined once, in the shared
 * types, because the web applies the same rule to what a board card shows
 * (Roadmap UX-04). Re-exported here so the API keeps importing it from its own
 * module.
 */
export {
  MAX_TITLE_WORDS,
  countWords,
  needsNormalization,
  truncateToWords,
} from '@pmhybrid/shared-types';
