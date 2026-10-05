import { LIMITS } from '../../common/dto-limits.js';
import { countWords, MAX_TITLE_WORDS } from './word-count.util.js';

export interface NormalizedTitle {
  title: string;
  description: string;
}

export type AnswerProblemCode =
  | 'NOT_JSON'
  | 'MISSING_TITLE'
  | 'MISSING_DESCRIPTION'
  | 'TITLE_TOO_LONG'
  | 'UNGROUNDED_TITLE'
  | 'INVENTED_TERM';

export interface AnswerProblem {
  code: AnswerProblemCode;
  /** Written to the model when it is asked to correct itself. */
  message: string;
}

export type AnswerCheck =
  | { ok: true; value: NormalizedTitle }
  | {
      ok: false;
      problems: AnswerProblem[];
      /** Present when the only fault is a title of more than 10 words: the answer is otherwise sound and can be cut locally. */
      salvage?: NormalizedTitle;
    };

/** The shortest description worth keeping: anything shorter says nothing the title did not. */
const MIN_DESCRIPTION_LENGTH = 20;

/** The JSON object in what the model answered, tolerating a markdown fence or a sentence around it. */
function extractJson(raw: string): unknown {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return undefined;
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”«»‘’]+|["'“”«»‘’]+$/gu, '')
    .replace(/[.]+$/, '')
    .trim();
}

/** Lower-case, accents removed, so "validación" and "VALIDACION" meet. */
const fold = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const contentWords = (text: string) =>
  fold(text).match(/[\p{L}\p{N}]{4,}/gu) ?? [];

function commonPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) {
    i += 1;
  }
  return i;
}

/**
 * Whether the new title is made of what the task says: at least half of its
 * content words (four letters or more) appear in the source, allowing a
 * different ending ("validar" for "validación"). A guard against a title that
 * is about something else, not a proof of faithfulness.
 */
export function isGroundedTitle(title: string, sourceText: string): boolean {
  const words = contentWords(title);
  if (words.length === 0) {
    return true;
  }
  const source = [...new Set(contentWords(sourceText))];
  const grounded = words.filter((word) =>
    source.some(
      (candidate) =>
        candidate === word ||
        commonPrefixLength(word, candidate) >=
          Math.min(4, word.length, candidate.length),
    ),
  );
  return grounded.length / words.length >= 0.5;
}

/**
 * Acronyms and identifiers in a text that the source never mentions: three or
 * more capitals ("SARHA"), or a token with a letter and a digit or three or
 * more digits ("F1-T104", "2026"). One or two digits are left alone — a model
 * numbers its own lists. These are what a model invents when it invents.
 */
export function inventedTerms(output: string, sourceText: string): string[] {
  const source = fold(sourceText);
  const tokens = [
    ...(output.match(/\b[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9]{2,}\b/gu) ?? []),
    ...(output.match(/[\p{L}\p{N}_-]*\p{N}[\p{L}\p{N}_-]*/gu) ?? []).filter(
      (token) =>
        (token.match(/\p{N}/gu) ?? []).length >= 3 || /\p{L}/u.test(token),
    ),
  ];
  return [...new Set(tokens)].filter((token) => !source.includes(fold(token)));
}

/**
 * Checks what the model answered against the source (Roadmap GAP-39c): a JSON
 * object with a `title` of at most 10 words that is made of what the task
 * says, a real `description`, and no identifier or number the task does not
 * contain. Everything fails closed — a doubtful answer is not used.
 */
export function checkAnswer(raw: string, sourceText: string): AnswerCheck {
  const parsed = extractJson(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      problems: [
        {
          code: 'NOT_JSON',
          message: 'The answer was not a single JSON object.',
        },
      ],
    };
  }
  const { title: rawTitle, description: rawDescription } = parsed as Record<
    string,
    unknown
  >;
  const problems: AnswerProblem[] = [];

  const title = typeof rawTitle === 'string' ? cleanTitle(rawTitle) : '';
  if (!title) {
    problems.push({
      code: 'MISSING_TITLE',
      message: '"title" must be a non-empty string.',
    });
  }
  const description =
    typeof rawDescription === 'string'
      ? rawDescription.trim().slice(0, LIMITS.TEXT)
      : '';
  if (description.length < MIN_DESCRIPTION_LENGTH) {
    problems.push({
      code: 'MISSING_DESCRIPTION',
      message: '"description" must be a real, extended description.',
    });
  }

  let tooLong = false;
  if (
    title &&
    (countWords(title) > MAX_TITLE_WORDS || title.length > LIMITS.TITLE)
  ) {
    tooLong = true;
    problems.push({
      code: 'TITLE_TOO_LONG',
      message: `"title" has ${countWords(title)} words; it must have at most ${MAX_TITLE_WORDS}.`,
    });
  }
  if (title && !isGroundedTitle(title, sourceText)) {
    problems.push({
      code: 'UNGROUNDED_TITLE',
      message:
        '"title" must be made of the words and ideas of the original task, not of something else.',
    });
  }
  const invented = inventedTerms(`${title} ${description}`, sourceText);
  if (invented.length > 0) {
    problems.push({
      code: 'INVENTED_TERM',
      message: `These are not in the original task and must not appear: ${invented.slice(0, 5).join(', ')}.`,
    });
  }

  if (problems.length === 0) {
    return { ok: true, value: { title, description } };
  }
  return {
    ok: false,
    problems,
    salvage:
      problems.length === 1 && tooLong ? { title, description } : undefined,
  };
}
