# Prompt: etapa de revisión, traspaso e identidad de agentes en la skill `project-documentation`

> Para pegar en una sesión de un agente de código con el repositorio
> `christiansendshp/skillProyectDocument` clonado, partiendo de `main` en el commit
> `15805b1` (la línea de tablas: `Status` = `TODO|IN_PROGRESS|PAUSE|DONE`, columna `Name`,
> la que usa el proyecto real SMARTHR). Supone la opción recomendada de `DEC-005` de PM Hub
> (los cambios del ledger van primero a la línea de tablas). Si la decisión fuera otra, no
> uses este prompt tal cual.

---

## 0. Tu rol

Eres un ingeniero que trabaja en la skill `project-documentation`: `scripts/project_docs.sh`
y `scripts/project_docs.ps1` (con paridad entre ambos), `templates/`, `references/`,
`adapters/`, `SKILL.md`, `README.md`, `scripts/smoke_test.sh` y `evals/evals.json`.

Tu tarea: implementar, de forma **retrocompatible**, los cambios de la sección 4 para que un
agente pueda decir en el ledger (`docs/Agentslog.md`), con palabras que `check` acepta:
**quién es** (identidad estable), **cuándo desarrolla**, **cuándo traspasa a revisión/QA** y
**cuál fue el resultado de la revisión**.

Trabaja siguiendo las reglas del propio `AGENTS.md` de este repositorio (claim antes de editar,
`check` verde antes de cerrar, `done` al final): es la mejor demostración de lo que vas a construir.

## 1. Por qué: dos productos, dos objetivos

- **La skill** sirve para **desarrollar en conjunto con agentes IA y que cada agente documente
  cada paso**. El ledger es "la fuente de verdad de la propiedad" y el estado de una tarea es lo
  que dice su última entrada. Su peor fallo es volver la documentación más pesada que el
  trabajo: los agentes la saltan o la escriben en lote. **Cada cambio tiene que costar casi nada
  a quien no lo use.**
- **PM Hub** (otra aplicación, fuera de tu alcance) sirve para **seguir proyectos**: lee
  `Roadmap.md` y `Agentslog.md` y muestra un Kanban con cinco columnas (PENDIENTE, ASIGNADA,
  EN_DESARROLLO, QA, TERMINADA). **Solo muestra lo que los documentos dicen**: no lo infiere de
  texto libre. Hoy, con la línea de tablas, lee `TODO→PENDIENTE`, `IN_PROGRESS→EN_DESARROLLO`,
  `DONE→TERMINADA`; **QA y ASIGNADA no se pueden expresar**, así que esas dos columnas están
  vacías para siempre.

Evidencia del proyecto real SMARTHR (2026-10-13): 0 de 293 tareas en QA o ASIGNADA; de las 358
tareas que tienen entrada de inicio y de cierre, **117 se cerraron en menos de 5 minutos** (91 en
menos de 1) y 56 tardaron una hora o más; en los ledgers de los proyectos que usan la skill el
mismo tipo de agente aparece como `claude`, `claude-code`, `Claude`, `claude-sonnet-5` y
`claude-sonnet-5-5`; y `done` no comprueba quién tiene la tarea.

## 2. Reglas que no se pueden romper

1. **Retrocompatibilidad total.** Un proyecto que nunca usa `REVIEW`, `ASSIGNED` ni el roster
   debe comportarse **exactamente** como hoy: mismas salidas de `check`, `status`, `context`,
   `rotate`. Todo lo nuevo es opcional y, salvo donde se indique, **avisa (WARN), no falla**.
2. **El `Status` de las filas del Roadmap sigue siendo exactamente `TODO`, `IN_PROGRESS`,
   `PAUSE`, `DONE`** (`check_table_status_enum`), y sus **cuatro columnas finales** (Status,
   Owner, Depends on, Pause reason) siguen siendo posicionales. **No añadas valores ni columnas.**
   Durante una revisión la fila **sigue en `IN_PROGRESS`**: la etapa vive en el ledger (coherente con
   `migrate`, que ya convierte `REVIEW`/`TESTING` de la línea YAML en `IN_PROGRESS`; por ejemplo
   `ConvertTo-MigratedWfStatus` en PowerShell, ~1017).
3. **Formato del encabezado del ledger intacto:** `## [YYYY-MM-DDTHH:mm:ssZ] | agent | TASK-ID | STATUS | Name`.
   `Name` (hasta 10 palabras) sigue copiándose de la fila del Roadmap y `check` sigue exigiendo
   que coincidan (`check_agentslog_roadmap_names`).
4. **Nunca se edita una entrada pasada.** Un cambio de estado es una entrada nueva.
5. `context` sigue en **8192 bytes** (`CONTEXT_LIMIT`); `append-log` conserva su contrato.
6. **Sin dependencias nuevas.** Solo `sh` POSIX / PowerShell, como hoy. Nada requiere PM Hub.
7. **No inferir etapas de texto libre.** Las etapas se declaran con palabras y líneas definidas.

## 3. Antes de tocar nada: confirma estos hechos (commit `15805b1`)

Revísalos leyendo el código. **Si alguno es falso, detente y repórtalo antes de implementar.**

| #   | Hecho                                                                                                                                                                                                                                                              | Dónde (`project_docs.sh`)                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| F1  | `check` rechaza cualquier palabra de estado del ledger que no sea `IN_PROGRESS`, `PAUSE` o `DONE`.                                                                                                                                                                 | `check_log_entries` → `validate()` (~1277)                        |
| F2  | El estado de una tarea es su última entrada; `all_task_states` imprime una línea TSV por tarea (`tid, status, agent, ts, pausecat, conflict, everdone, name`).                                                                                                     | `all_task_states` (289)                                           |
| F3  | **Los consumidores leen con `read -r tid status agent ts pausecat conflict everdone name`: la última variable absorbe el resto de la línea.** Añadir columnas al TSV rompe `name` si no actualizas cada `read`.                                                    | `open_tasks_line` (357), `cmd_status` (748), `rotate_log` (~1739) |
| F4  | `open_tasks_line` (la sección "Open tasks" de `context`), `cmd_status`, el aviso de "stale" en `check_warnings` y el arrastre de `rotate_log` solo consideran `IN_PROGRESS` y `PAUSE`: **una tarea cuya última entrada fuera `REVIEW` desaparecería de todo eso.** | líneas 357, 748, 1577, ~1739                                      |
| F5  | `claim` rechaza si la última entrada es `IN_PROGRESS` de otro agente y no está vencida (`is_stale`, `PROJECT_DOCS_STALE_HOURS`, 24 h), o `PAUSE` de categoría no `LIMITE` de otro agente.                                                                          | `cmd_claim` (655)                                                 |
| F6  | **`cmd_done` no comprueba quién tiene la tarea ni su estado**: solo exige `verify` no vacío y un `Name` válido. Cualquier agente puede cerrar la tarea de otro.                                                                                                    | `cmd_done` (724)                                                  |
| F7  | `check` ya trata `Verify` vacío o `pending` en un `DONE` como error; el `Name` del ledger debe tener ≤ 10 palabras y coincidir con el del Roadmap.                                                                                                                 | `check_log_entries`, `check_agentslog_roadmap_names` (1557)       |
| F8  | La identidad del agente es texto libre y la propiedad se compara por **igualdad exacta**: `claude-sonnet-5` no puede pausar lo que tomó `claude-sonnet-5-5`. No hay roster.                                                                                        | `cmd_claim`, `cmd_pause`, `task_state`                            |
| F9  | `append_log` escribe el encabezado **sin** `Name` y es el "escape hatch" legado; `check` lo tolera porque salta los `Name` vacíos.                                                                                                                                 | `append_log` (1681)                                               |

Los equivalentes en PowerShell están en `project_docs.ps1`: `Get-TaskStates` (335), `Get-TaskState`
(388), `Get-HotContext` (424), `Invoke-Claim` (742), `Invoke-Pause` (780), `Invoke-Done` (812),
`Invoke-Status` (841), `Test-LogEntries` (1326). Confirma también F1 a F6 allí.

## 4. Cambios a implementar

Implementa **en este orden**; cada cambio con sus pruebas (sección 5) antes de pasar al siguiente.

### Cambio 1 — La palabra `REVIEW` en el ledger

Máquina de estados (todo en el ledger; el Roadmap no cambia):

```
IN_PROGRESS (dev) --handoff--> REVIEW (dev; "- Handoff: <agente o rol>")
REVIEW (revisor)  "- Review: PASS - detalle"  --> listo para DONE
REVIEW (revisor)  "- Review: FAIL - detalle"  --> vuelve al desarrollador (IN_PROGRESS para él)
```

- `check_log_entries`: acepta `REVIEW` (y `ASSIGNED` solo si implementas el Cambio 7). Actualiza el
  mensaje de error. Una entrada `REVIEW` exige `- Summary:` y `- Verify:` no vacío ni `pending`
  (igual que `DONE`: es lo que el desarrollador verificó antes de traspasar). Admite las líneas
  opcionales `- Handoff: <agente o rol>` y `- Review: PASS|FAIL - <detalle>`; si hay `Review`, el
  resultado debe ser `PASS` o `FAIL` y el detalle no vacío.
- `all_task_states`: conserva la semántica actual. Agrega **al final** del TSV: `holder` (agente
  de la última entrada `IN_PROGRESS`, o `agent` si no hay), `handoff` (destino de la última línea
  `Handoff`) y `review` (`PASS`, `FAIL` o vacío, de la última línea `Review`). **Actualiza todos
  los `read -r` (F3).** Define "etapa efectiva": `REVIEW` si la última entrada es `REVIEW` sin
  `Review: FAIL`; en otro caso la palabra de la última entrada (un `FAIL` equivale a de vuelta con
  el desarrollador).
- **Regla de conflicto** (`all_task_states` y `check_log_entries`): hoy dos `IN_PROGRESS`
  seguidos de agentes distintos son un conflicto. **Dos entradas `REVIEW` de agentes distintos
  NO lo son** (desarrollador y revisor). Un `IN_PROGRESS` de un agente distinto del titular justo
  después de un `REVIEW` sin `FAIL` sí es un conflicto, salvo que esté vencido.
- Titular: durante `REVIEW` el titular sigue siendo el desarrollador. `claim` por el titular se
  permite (retoma tras un `FAIL`, o retira el traspaso); por otro agente se rechaza salvo vencido
  (`is_stale`), igual que con `IN_PROGRESS`.
- `open_tasks_line`, `cmd_status`, `check_warnings`, `rotate_log` (F4): incluyen `REVIEW`.
  `status` muestra la etapa y el destino (`F2-T02 | Name | dev | REVIEW→qa-agent | 3h | -`).
  `check_warnings`: `WARN: <id> has been in REVIEW for Nh (>= STALE_HOURSh)`. **`rotate` debe
  arrastrar las tareas en `REVIEW`** al ledger nuevo, como hace con `IN_PROGRESS` y `PAUSE`.

### Cambio 2 — `handoff`

`handoff <project> <agent> <task-id> <summary> <verify> [reviewer]`

- Exige que la tarea esté en `IN_PROGRESS` **y** sea del `<agent>` (mismas comprobaciones que
  `pause`); `verify` no vacío ni `pending`; `Name` válido (`require_valid_name "$task" handoff`).
- Escribe una entrada `REVIEW | <Name>` con `Summary`, `Verify` y, si se da `reviewer`,
  `- Handoff: <reviewer>`. **No toca la fila del Roadmap** (sigue `IN_PROGRESS`, mismo `Owner`).
- Con el lock (`with_lock`) como `claim`/`pause`/`done`.

### Cambio 3 — `review`

`review <project> <agent> <task-id> <PASS|FAIL> <note> [verify]`

- Solo si la última entrada de la tarea es `REVIEW` sin resultado (traspaso pendiente). `note` no
  vacío; `verify` obligatorio (no vacío ni `pending`) cuando es `PASS`.
- Escribe una entrada `REVIEW | <Name>` **a nombre del revisor** con `- Review: PASS|FAIL - <note>`
  (y `Verify` si lo hay). **No toca la fila del Roadmap.**
- Si `<agent>` es el mismo que el desarrollador: **WARN** ("self-review"), no error, para no
  congelar proyectos con un solo agente. Con `PROJECT_DOCS_REQUIRE_INDEPENDENT_REVIEW=1` es error.
- Si el roster (Cambio 5) existe y el agente tiene rol `DEVELOPER` (no `QA` ni `BOTH`): WARN.
- Tras `FAIL`, el desarrollador retoma con `claim` (escribe `IN_PROGRESS`, F5).

### Cambio 4 — `done` comprueba quién cierra (F6)

- Permitido si: no hay entradas de la tarea (cierre retroactivo, como hoy); o el agente es el
  **titular**; o es el **revisor que dejó `Review: PASS`**; o la última entrada está vencida
  (`is_stale`); o `PROJECT_DOCS_FORCE=1`. En otro caso: error
  `done failed: <id> is held by <agent>` (mismo tono que `claim`).
- Si el titular cierra con un traspaso pendiente o con `Review: FAIL`: **WARN** "closing without a
  passing review", no error.
- WARN (no error) si `verify` es un marcador vacío de contenido: `none`, `n/a`, `no run`,
  `ninguno`, `—`, `UNKNOWN` (sin distinguir mayúsculas).
- El cierre retroactivo (sin `claim` previo) sigue permitido: es el caso real de los lotes.

### Cambio 5 — Identidad estable de los agentes (el roster)

- `templates/AGENTS.md`: agrega una sección `## Agent identity` con una tabla y la regla "un solo
  texto por agente y siempre el mismo":

  ```markdown
  | Agent id          | Kind | Model             | Role | Aliases                 |
  | ----------------- | ---- | ----------------- | ---- | ----------------------- |
  | claude-sonnet-5-5 | AI   | Claude Sonnet 5.5 | BOTH | claude, claude-sonnet-5 |
  ```

  `Kind`: `HUMAN` o `AI`. `Role`: `DEVELOPER`, `QA` o `BOTH`. **No agregues la sección a la lista
  `need` de `check_docs`** (los proyectos anteriores no la tienen).

- Función `canonical_agent` (y su equivalente en PowerShell): si existe la sección y tiene al menos
  una fila de datos, normaliza el `<agent>` de `claim`, `pause`, `handoff`, `review`, `done` (y
  `assign`) a `Agent id` comparando **sin distinguir mayúsculas** contra el id y los alias. Si es
  desconocido: `WARN: unknown agent "<x>" (not in the Agent identity table)` y se usa tal cual.
  **Sin sección o sin filas: comportamiento actual, sin avisos.**
- `check`: si hay roster con filas, `WARN` por cada nombre de agente del ledger caliente que no sea
  id ni alias (máximo 10, con conteo). Nunca falla. No reescribe entradas pasadas.
- `init` crea la sección vacía (solo la fila de ejemplo comentada o un marcador `—`) para proyectos
  nuevos; en proyectos existentes no la agrega.

### Cambio 6 — Aviso de trabajo documentado después de hecho

- `done` (y `check`, sobre el ledger caliente): **WARN** si el primer `IN_PROGRESS` de la tarea y su
  `DONE` están a menos de `PROJECT_DOCS_MIN_WORK_MINUTES` (por defecto **5**) minutos:
  `WARN: <id> was claimed and closed 3s apart; claim before the first edit so the work is visible
while it happens`. En `check`, **un solo resumen** (`WARN: 117 of 358 closed tasks were closed
within 5 min of their claim`) más como máximo las 5 más recientes. **Nunca falla.** Cerrar en lote
  es legítimo; solo se dice.

### Cambio 7 — `assign` y `ASSIGNED` (opcional: hazlo solo si 1 a 6 están verdes)

`assign <project> <agent> <task-id> <to-agent>`: entrada `ASSIGNED` a nombre de `<agent>` con
`- Assign: <to-agent>`; la fila queda `TODO` con `Owner` = `<to-agent>@<timestamp>`; no empieza el
trabajo. `claim` por otro agente distinto del asignado: WARN. `check` acepta `ASSIGNED`. Mismas
reglas de nombre, lock y retrocompatibilidad.

### Cambio 8 — Plantillas y documentación

- `templates/AGENTS.md` (`## Startup` y `## Taking a task`): tres reglas explícitas.
  (a) **`claim` antes de la primera edición**, no después; (b) **`handoff` cuando el código está
  completo y tu propia verificación pasó**, si el proyecto tiene un revisor (si no, ve a `done`);
  (c) **`done` solo tras la verificación** (y tras `review PASS` si hubo traspaso). Añade una
  frase: "documentar después de hecho (claim y done seguidos) está permitido, pero el tablero no
  puede mostrar el trabajo mientras ocurre".
- `templates/Agentslog.md`: el formato de entrada incluye `REVIEW`, `- Handoff:` y `- Review:`;
  aclara que el estado de una tarea es su última entrada y qué significa un `FAIL`.
- `SKILL.md`, `README.md`, `references/workflow.md` (secciones "Taking and closing a task" y
  "Ledger"): comandos nuevos, la máquina de estados, las variables de entorno nuevas
  (`PROJECT_DOCS_MIN_WORK_MINUTES`, `PROJECT_DOCS_REQUIRE_INDEPENDENT_REVIEW`, `PROJECT_DOCS_FORCE`).
- `references/adapters.md` y los archivos de `adapters/`: cada runtime debe usar **siempre el mismo
  texto** como id de agente (el de la tabla del roster) y no inventarlo en cada sesión.

### Cambio 9 — Paridad, pruebas y evals

Todo lo anterior en `project_docs.sh` **y** `project_docs.ps1`, con el mismo comportamiento y los
mismos mensajes. Detalle en la sección 5.

## 5. Pruebas y evals

En `scripts/smoke_test.sh` (dentro de `run_suite`, con `assert_success`, `assert_failure`,
`assert_contains`; se ejecuta para sh y, si hay intérprete, para ps1) y como evals nuevos en
`evals/evals.json` (el último id actual es 25; continúa desde 26):

1. `check` acepta `REVIEW` y sigue rechazando una palabra desconocida; un `REVIEW` sin `Verify`
   válido falla.
2. `handoff` por el titular escribe `REVIEW`, deja la fila en `IN_PROGRESS` con el mismo `Owner`, y
   la tarea aparece en `status` y en la sección "Open tasks" de `context` con su etapa y destino.
3. `handoff` falla si no eres el titular, si la tarea no está `IN_PROGRESS` o si `verify` está
   vacío o es `pending`.
4. `review PASS` por otro agente: entrada `REVIEW` con `Review: PASS`; luego `done` por el titular
   funciona; `done` por un tercero **falla**; `done` por el revisor que pasó funciona.
5. `review FAIL`: la etapa efectiva vuelve al desarrollador; su `claim` funciona; el `claim` de un
   tercero falla (no vencido).
6. Auto-revisión: WARN por defecto; error con `PROJECT_DOCS_REQUIRE_INDEPENDENT_REVIEW=1`.
7. Dos `REVIEW` de agentes distintos **no** producen "conflicting concurrent claim".
8. `rotate` con una tarea en `REVIEW`: el ledger nuevo la conserva y `status` la sigue mostrando.
9. Aviso de vencida para `REVIEW` (con `PROJECT_DOCS_STALE_HOURS=0`).
10. Roster: sin sección no hay avisos; con ella, un alias se normaliza al id en la cabecera de la
    entrada, un nombre desconocido da WARN y `check` lista los desconocidos sin fallar.
11. `done` inmediatamente después de `claim` muestra el WARN de cierre instantáneo y **no** falla.
12. `done` de una tarea nunca reclamada sigue funcionando (cierre retroactivo).
13. **Regresión:** un proyecto sin ninguna de las palabras o secciones nuevas produce exactamente
    la misma salida de `check`, `status` y `context` que antes (los evals 1 a 25 siguen verdes).
14. `ASSIGNED` y `assign`, si implementaste el Cambio 7.

Ejecuta `sh scripts/smoke_test.sh` (y con PowerShell si está disponible) hasta que todo pase.

## 6. Lo que PM Hub leerá (no lo rompas)

PM Hub no se modifica en esta tarea, pero depende de este contrato. Si cambias algo de esto, avisa.

```markdown
## [2026-10-13T14:00:00Z] | claude-sonnet-5-5 | F2-T02 | REVIEW | Name de la tarea

- Summary: qué se hizo
- Verify: qué verificó el desarrollador
- Handoff: qa-agent

## [2026-10-13T15:00:00Z] | qa-agent | F2-T02 | REVIEW | Name de la tarea

- Summary: qué revisó
- Verify: qué comprobó el revisor
- Review: PASS - detalle (o: FAIL - detalle)
```

PM Hub derivará: última entrada `REVIEW` sin `Review: FAIL` → columna **QA**; `Review: FAIL` →
**EN_DESARROLLO**; `ASSIGNED` sobre una fila `TODO` → **ASIGNADA**; el `Owner` de la fila sigue
siendo `desarrollador@timestamp`.

## 7. Qué NO hacer

- No añadir valores a `Status` del Roadmap ni columnas a sus tablas.
- No cambiar el encabezado del ledger ni la regla del `Name`.
- No hacer obligatorio el traspaso a revisión: un proyecto sin revisor sigue yendo de `claim` a `done`.
- No convertir los avisos en errores, salvo `PROJECT_DOCS_REQUIRE_INDEPENDENT_REVIEW=1`.
- No editar entradas pasadas del ledger ni "normalizarlas".
- No tocar el límite de `context`, ni el formato de `append-log`, ni `migrate`.
- No mezclar con otros cambios (por ejemplo la línea YAML antigua): una rama, un tema.
- No hacer push a `main`: abre una rama `feature/review-handoff-and-agent-identity` y un PR.

## 8. Entrega y reporte

Entrega en commits atómicos (uno por cambio), con la rama y el PR. Tu reporte final debe traer:

1. Los hechos F1 a F9: confirmados o no (con la corrección si no).
2. Archivos modificados, por cambio.
3. La salida completa de `sh scripts/smoke_test.sh` (y de PowerShell si la corriste).
4. Decisiones que tomaste donde este prompt no era exacto, y por qué.
5. Lo que **no** verificaste (por ejemplo PowerShell si no tenías intérprete).
6. Preguntas abiertas.
