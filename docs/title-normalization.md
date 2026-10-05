# Title normalization with an LLM

A task read from `Roadmap.md` whose title is longer than 10 words is normalized
by the instance's configured LLM into a title of at most 10 words plus an extended
description (Roadmap GAP-39, ADR-020). A title of 10 words or fewer is kept
untouched and the LLM is never called for it.

## The rule

- **What a word is.** A whitespace-separated token with a letter or a digit in it,
  so a lone dash, an ampersand or a bullet does not count. A title of 10 words or
  fewer is kept; one of 11 or more is normalized (`countWords`,
  `needsNormalization`, `apps/api/src/modules/title-normalization/word-count.util.ts`).
- **Which tasks.** Those read from the document: a new row with a long title, or a
  row whose title the document changes to a long one. A title a person types in PM
  Hub is theirs and is never normalized. Tasks read before the feature existed are
  queued by an explicit action (below).
- **Nothing is lost.** The title the document holds is kept in `Task.originalTitle`
  and `Roadmap.md` is never written by normalization. `docs/synchronization.md`
  ("Long titles") says how sync treats the pair.

## Configuration

The connection to the LLM is configured in the app, by an actor holding the global
`settings.manage` permission (`ADMIN` has it), and lives in the database — never in
`.env` or an environment variable (`LlmSettings`, one row per instance: PM Hub has no
organization model, the instance is the unit).

| Field                        | Meaning                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider                     | `ANTHROPIC` or `OPENAI`. Changing it without naming a model moves to that provider's default model                                                                        |
| Model                        | The provider's model name. Defaults: `claude-haiku-4-5-20251001`, `gpt-4o-mini`                                                                                           |
| API key                      | Write-only. Stored encrypted; never returned, logged, audited or shown again. Replacing it is deliberate; leaving it out keeps the stored one                             |
| Enabled                      | Switches the integration on. Refused without a readable key                                                                                                               |
| Temperature, timeout, tokens | Optional. Temperature unset sends nothing (the provider's default applies); timeout 1–120 s (default 30); output tokens 64–8192 (default 1024)                            |
| Status                       | `NOT_CONFIGURED` (no key), `DISABLED` (key stored, switched off), `KEY_UNREADABLE` (the key cannot be decrypted), `READY` (the only state in which the app calls the LLM) |

`POST /settings/llm/test` makes a minimal real call with the stored configuration,
also while the integration is off, so a key, a model and the network are known to
work. Its answer carries an error already free of the key.

## What is sent, and what is asked

For one task the LLM receives: the task's id, its entry type, the names of its phase
and epic, the title, the description if there is one, and the acceptance criteria.
It is asked for exactly one JSON object:

```json
{ "title": "at most 10 words", "description": "extended and precise" }
```

The instructions (`title-prompt.ts`) require a clear, concise, specific title that
keeps the original's key terms and identifiers, and a description that carries what
the title cannot — what is to be done, the objective, context, scope, rules and
conditions mentioned, the expected result and the criteria for considering it
solved — only from what the task says, in the task's own language, inventing no
requirement and changing no scope. The task's text is delimited as data and the
instructions say it is never an instruction to the model; the task cannot close the
delimiter it sits in.

## Validation, retry and fallback

The answer is checked before it is used (`title-validation.util.ts`):

- it is a single JSON object (a markdown fence or a sentence around it is
  tolerated), with a text `title` and a text `description` of real length;
- the title has at most 10 words;
- the title is made of the task's own words: at least half of its content words
  appear in the source, allowing a different ending (`validar` for `validación`);
- no acronym of three or more capitals, and no identifier or number of three or more
  digits, appears in the answer that the task does not contain.

The last two are a heuristic, not a proof of faithfulness; a doubtful answer is not
used. If the first answer fails, the model is told what was wrong and asked once
more. If the title is then still the only fault, it is cut locally to its first 10
words (without ending on a connector) and the description is kept; anything else is
a failure and the task is left as it was.

## Failure

A missing or disabled configuration, an unreadable key, a connection error, a
timeout, a rate limit, a provider error, invalid JSON or an unusable answer never
stops the processing of the Roadmap: the task keeps its title, its state becomes
`FAILED` with a short message (free of the key — provider text is stripped of it
and cut), the error is logged without detail, and the rest of the queue goes on.
While the LLM is not ready the queue simply waits: sync marks tasks `PENDING` and
works them once it is.

To try again: `POST /projects/:projectId/titles/normalize` (`project.update`) puts
the failed ones and the long titles never queued back in the queue;
`POST /projects/:projectId/tasks/:taskId/normalize-title` (`task.write`) does it for
one task. Nothing is retried in a loop.

## Where it lives

| Column on `Task`          | Meaning                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `originalTitle`           | What the document holds, once `title` has been normalized                                      |
| `titleNormalization`      | `PENDING`, `DONE` or `FAILED`; null when the title was never long                              |
| `titleNormalizationError` | Why it failed                                                                                  |
| `titleNormalizedAt`       | When it was done                                                                               |
| `generatedDescription`    | The description the normalization wrote; while `description` equals it, it is the system's own |

A description a person wrote is never replaced: the title is normalized and the
person's text stays. Every normalization is audited as `TITLE_NORMALIZE`, origin
`SYSTEM`.

## Security

- The key is AES-256-GCM ciphertext (`common/secret-crypto.util.ts`), with a key
  derived (HKDF-SHA256) from `JWT_SECRET`, a random IV per encryption and the purpose
  bound as additional data. **Changing `JWT_SECRET` makes the stored key unreadable**:
  the status reads `KEY_UNREADABLE` and the key is entered again in Settings.
- Every route under `/settings/llm` needs `settings.manage`, reading included. A
  response says only `hasApiKey` and a `status`; the key is built out of every
  response, audit event and log line (only `apiKeyChanged` is audited).
- The key is sent only to the provider named in the configuration, in its own header.
  A provider's error text is sanitized before it is kept: the key and anything shaped
  like one are removed.
- Under a test runner no real provider is ever called (`LlmModule`).
