# Metrics: pace, burn-up and forecast

Status: the calculator (Roadmap TASK-35), the endpoint (TASK-36) and the Seguimiento tab (TASK-37) exist.
This page is where all three are described.

## The calculator (`apps/api/src/modules/metrics/pace.util.ts`)

A pure function, `paceOf(tasks, weeks, now)`, like `ProgressCalculator`: it reads no database and no clock.
The caller gives the project's tasks (deleted ones out) as `{ createdAt, completedAt | null, phaseId | null }`,
how many weeks to draw, and the moment it is read.

| Output      | Meaning                                                                                                                                                                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `weeks[]`   | One point per week, oldest first, the last one being the week in progress (`partial: true`): tasks `completed` and `created` during it, and the `scope` and `done` counts at its end (cumulative, counting what came before the first week drawn). |
| `byPhase[]` | The same `scope` and `done` per week for each phase and for the tasks of none (`phaseId: null`). Summed over the phases, each week equals the project's.                                                                                           |
| `forecast`  | When the open work ends, as a range, see below.                                                                                                                                                                                                    |

### The weeks

A week runs from Monday 00:00 to the next Monday 00:00, **UTC**. That is what `date_trunc('week', …)` gives
on the `timestamp` columns of `Task`, which hold UTC, and it is what the SQL of the appendix of
`docs/tracking-improvement-plan.md` draws. `apps/api/test/pace-weeks.e2e-spec.ts` runs both on the same
moments, the boundaries of a week and of a year among them, and requires the same Monday.

### The forecast

The forecast reads **all the history of the project**, whatever number of weeks the chart draws, so asking
for 4 weeks or for 52 does not change it. It averages the last 2 and the last 4 **complete** weeks (the week
in progress is left out, as its pace is not known yet). With `completed` and `created` per week in a window,
the work that is open ends in `open / (completed − created)` weeks (the scope that keeps arriving counted)
and in `open / completed` weeks (if no new work arrived at all); both dates are given for each window, so the
scope growth is always beside the date.

| Status                  | When                                                                                                    | Dates                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OK`                    | At least one window ends (it finishes more than arrives).                                               | `range`: the earliest and the latest of the dates of the windows with new work counted. A window that does not end gives none; the other still does. |
| `NOT_ENOUGH_HISTORY`    | The project has no tasks, or fewer than 2 complete weeks since its first task appeared or was finished. | None.                                                                                                                                                |
| `NOTHING_OPEN`          | Every task is finished.                                                                                 | None.                                                                                                                                                |
| `NO_RECENT_COMPLETIONS` | No task was finished in the weeks the forecast reads: there is no pace.                                 | None.                                                                                                                                                |
| `NOT_CONVERGING`        | Work arrives as fast as, or faster than, it closes in every window.                                     | None in `range`; each window still says the date it would end at without the new work.                                                               |

A window never averages more weeks than the project has lived: a project with 3 complete weeks of history
gives a 2-week and a 3-week window, not a 4-week one padded with empty weeks.

The forecast declines before it guesses (BR-016): it is never one date, and it says why when it has none.

## The endpoint (`GET /projects/:projectId/metrics/pace`)

Any member of the project can read it (`ProjectMemberGuard`); it only reads, and there is no migration. It sits
beside `GET …/metrics` (the instant closes of Roadmap TASK-12) and `GET …/metrics/spans` (TASK-23), which are
left as they are: that one reads the ledger from the repository, and the pace needs only the database.

- `?weeks=` is a whole number from 2 to 52, 12 when it is not given; anything else is a 400. It sets the weeks
  drawn, never the forecast, which reads the whole history.
- It reads the tasks **that count towards the progress**: alive, and work (the PHASE, EPIC, DECISION, BLOCKER,
  DEPENDENCY, VISION and THEME cards are not), the same filter as the progress rollup so an epic never inflates
  the scope. The appendix SQL of the plan counts every non-deleted `Task` row; run with this filter it gives the
  same weekly figures, which `apps/api/test/pace-endpoint.e2e-spec.ts` checks on a project with tasks of each
  kind.
- `byPhase` lists the phases in their own order, with their names, and the tasks of no phase last with
  `phaseId` and `name` null; a phase with no task has no line.
- A project with no task answers 12 weeks of zeros and `NOT_ENOUGH_HISTORY`.
- A task finished and then reopened loses its `completedAt` (the app clears it), so its week no longer counts it:
  the figures are of the tasks as they stand, as the SQL is.

## The Seguimiento tab (`/projects/:projectId/pace`)

A tab of the project, next to Progreso (`apps/web/src/app/features/pace`). It reads
`GET …/metrics/pace` **once per visit** (the page has no weeks selector, so the default 12 weeks are drawn) and
shows, in this order:

1. **When the open work ends.** A sentence for the forecast's status (BR-016): the range with the new work
   counted ("terminaría entre el … y el …") and "Es una estimación, no una promesa"; or, with no date,
   "No hay historia suficiente…", "No queda trabajo abierto…", "No se cerró ninguna tarea en las últimas semanas
   completas…" or "El trabajo nuevo llega tan rápido como, o más rápido que, el que se cierra: … no termina",
   which still says when it would end without the new work. Below it, a table of each window (the last 2 and 4
   complete weeks): closed and new tasks per week, and the date with and without the new work ("no termina",
   "sin ritmo" where there is none).
2. **Closed and created per week.** Paired bars (closed solid, created hatched, the value on each bar; the
   week in progress lighter), a sentence ("En las últimas 12 semanas: 3 tareas cerradas y 5 creadas. Se crea más
   trabajo del que se cierra.") and the table of the numbers, open.
3. **Scope and finished tasks.** The burn-up of the project and then of each phase, in the phases' order and
   "Sin fase" last: two lines (the scope continuous, what is done dashed), a sentence of how both moved and the
   table of the numbers (open for the project, closed for the phases).

No figure is only in a drawing or a colour: every chart has a sentence and a table, the two series differ in
stroke or pattern as well as colour, and the drawings are `aria-hidden` because the table says the same. The
tables scroll inside their own region (`.table-scroll`, focusable) when they are wider than the screen, never
the page. Dates are the API's UTC days shown as that day (`core/pace.ts`). The texts are pure functions
(`forecastSentence`, `weeklySentence`, `burnUpSentence`) with their own tests; the page and the chart have
component specs, and the page is in the accessibility, mobile-layout and target-size suites.
