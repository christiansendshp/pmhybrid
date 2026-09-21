/**
 * Maximum lengths for what a request may carry (Roadmap IMPROVEMENT-01b).
 * Nothing had one: a title of 90,000 characters made Roadmap.md 96 KB, and an
 * unbounded body is also the cheapest way to fill the database. Sized for the
 * real use of each field, with room — a limit is a guard, not a style rule.
 */
export const LIMITS = {
  /** A person's, project's, phase's, epic's or agent's name. */
  NAME: 200,
  /** A task's title — it becomes a heading and a table cell in the document. */
  TITLE: 300,
  /** A description. */
  TEXT: 10_000,
  /** A task's acceptance criteria. */
  CRITERIA: 5_000,
  /** A comment. */
  COMMENT: 5_000,
  /** A folder path or a repository path. */
  PATH: 1_024,
  /** A URL. */
  URL: 2_048,
  /** An identifier (a uuid is 36; the rest is room for a Roadmap id and future formats). */
  ID: 100,
  /** A short label: an operation, an entity type, a provider, an external reference. */
  LABEL: 200,
  /** RFC 5321's limit for an address. */
  EMAIL: 254,
  /** Above bcrypt's 72 bytes anyway; the cap only stops a megabyte password being hashed. */
  PASSWORD: 128,
  /** A token or an opaque cursor. */
  TOKEN: 2_048,
  /** Entries in a list a request may send (permission keys). */
  LIST: 500,
} as const;
