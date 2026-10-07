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
  queued the moment the configuration is ready, or by an explicit action (below).
- **Nothing is lost.** The title the document holds is kept in `Task.originalTitle`
  and `Roadmap.md` is never written by normalization. `docs/synchronization.md`
  ("Long titles") says how sync treats the pair.

## Configuration

The connection to the LLM is configured in the app, by an actor holding the global
`settings.manage` permission (`ADMIN` has it), and lives in the database — never in
`.env` or an environment variable (`LlmSettings`, one row per instance: PM Hub has no
organization model, the instance is the unit).

| Field                        | Meaning                                                                                                                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider                     | `ANTHROPIC`, `OPENAI` or `OPENROUTER`. Changing it without naming a model moves to that provider's default model                                                                                     |
| Model                        | The provider's model name. Defaults: `claude-haiku-4-5-20251001`, `gpt-4o-mini`, `anthropic/claude-haiku-4.5` (OpenRouter names a model with its maker's prefix, e.g. `google/gemini-2.0-flash-001`) |
| API key                      | Write-only. Stored encrypted; never returned, logged, audited or shown again. Replacing it is deliberate; leaving it out keeps the stored one                                                        |
| Enabled                      | Switches the integration on. Refused without a readable key                                                                                                                                          |
| Temperature, timeout, tokens | Optional. Temperature unset sends nothing (the provider's default applies); timeout 1–120 s (default 30); output tokens 64–8192 (default 1024)                                                       |
| Status                       | `NOT_CONFIGURED` (no key), `DISABLED` (key stored, switched off), `KEY_UNREADABLE` (the key cannot be decrypted), `READY` (the only state in which the app calls the LLM)                            |

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

**Nothing needs asking once it is ready.** Saving a configuration that is ready
(enabled, with a readable key) — the first time, or a corrected key, model or
provider — makes the API queue the failed ones and the long titles never queued of
every project that is not archived, the ones read before the feature existed
included, and work them one project after another, with no sync and no request. A
save that changes nothing, or that leaves the integration off, does nothing. It runs
in the background after the save has answered, one pass at a time (a save during a
pass makes it go round once more), and its failures are outcomes on the tasks, never
an error of the save.

A refused key or quota is different: an HTTP 401 or 403 (the key is wrong or the provider
does not know it — OpenRouter keys are `sk-or-v1-…` and only work with the `OPENROUTER`
provider) or a 429 (a rate limit or a spent quota, common with free models) says nothing
about the task, so the pass ends at the first such answer: that task is `FAILED` with the
reason and the rest of the queue stays `PENDING`, waiting, instead of every task being
sent and marked failed. The next pass — a sync, saving the configuration again — goes on.

**A sync adapts what failed too.** When a sync finishes, the tasks of that project that
failed, and have failed fewer than three times in a row (`Task.titleNormalizationAttempts`),
are queued again with the ones the sync marked, so a Roadmap ends adapted without anyone
asking. After the third failure in a row only an explicit action tries the task again, so a
task that always fails is not paid for at every sync. Everything stays in the system:
`Roadmap.md` is never written.

**An answer with no text** (a model that reasons can spend the whole output budget before
it writes, which OpenRouter's free models do now and then) is asked again once with an
output budget four times larger, up to 8192 tokens; if that is empty too, it is a failure.

**How fast.** Within a project the queue is worked four calls at a time, the first call of
a pass on its own (so a wrong key costs one call), instead of one at a time: a free model
takes 10 to 50 seconds per answer, which left a Roadmap of 150 tasks unadapted for hours.

To try again: `POST /projects/:projectId/titles/normalize` (`project.update`) puts
the failed ones and the long titles never queued back in the queue (the same thing
the save above does for every project, and both start the count of failures again);
`POST /projects/:projectId/tasks/:taskId/normalize-title` (`task.write`) does it for
one task. Nothing is retried in an unbounded loop.

## In the app

- **Configuración** (`/settings`, shown in the navigation only to a holder of
  `settings.manage`): provider, model, the key field, the switch, the optional
  parameters, the status and the connection test. The key field is write-only: once
  a key is stored the page shows only that one exists, with "Reemplazar clave" and
  "Quitar clave" (which asks first and also switches the integration off), and the
  field starts empty after every save, so the key is never in the page again. The
  field asks the browser not to offer the person's own login password
  (`autocomplete="new-password"`).
- **Task detail**: for a normalized task, the title the Roadmap holds and when it
  was summarized; while it is queued, a note; when it failed, the reason and a
  "Reintentar" button for whoever has `task.write` (the page looks again for a few
  seconds, since the work is done in the background).
- **Project settings, "Títulos largos"** (`project.update`): queues the failed ones
  and the long titles read before the feature existed, and says how many, or that
  they wait because the LLM is not ready.

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
