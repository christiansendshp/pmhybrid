# GOAL

Desarrollar un MVP funcional de una aplicación web moderna para administrar múltiples proyectos de software mediante una metodología cooperativa entre **usuarios humanos y agentes de Inteligencia Artificial**.

La aplicación debe utilizar como fuente estructural los documentos definidos en:

https://github.com/christiansendshp/skillProyectDocument

## 1. REGLA FUNDAMENTAL

ANTES DE DESARROLLAR:

1. Analizar completamente el repositorio `skillProyectDocument`.
2. Identificar y documentar:
   - estructura de carpetas;
   - tipos de documentos;
   - ROADMAP;
   - AGENT LOG / AGENTSLOG;
   - fases;
   - épicas;
   - templates;
   - tareas;
   - subtareas;
   - estados;
   - campos;
   - relaciones y dependencias.
3. La aplicación NO debe inventar una estructura paralela que contradiga esos documentos.
4. Los documentos del proyecto constituyen la **fuente de verdad funcional**.
5. Si el repositorio no es accesible, detenerse y dejar explícitamente documentado qué información falta antes de asumir estructuras.

---

# 2. CONCEPTO DE LA APLICACIÓN

La aplicación será un:

**Project Management Hub para equipos Humanos + Agentes IA.**

Debe permitir administrar múltiples proyectos simultáneamente.

Cada proyecto tendrá:

- nombre;
- descripción;
- repositorio;
- ubicación de los documentos;
- integrantes;
- usuarios humanos;
- agentes IA;
- roles;
- permisos;
- configuración de sincronización;
- estado general;
- métricas de avance.

Un mismo usuario o agente puede participar en múltiples proyectos.

---

# 3. ACTORES

Soportar como mínimo:

### HUMAN

Usuario humano.

### AI_AGENT

Agente de Inteligencia Artificial.

Los agentes deben ser entidades administrables dentro del sistema, por ejemplo:

- Codex
- Claude
- Gemini
- Agente QA
- Agente UI/UX
- Agente Research
- etc.

No asumir nombres concretos: deben poder crearse y configurarse.

Cada actor debe tener:

- ID
- nombre
- tipo: HUMAN / AI_AGENT
- avatar/icono
- email o identificador cuando corresponda
- rol dentro del proyecto
- estado activo/inactivo.

---

# 4. ROLES Y PERMISOS

Implementar RBAC.

Como mínimo:

- OWNER
- PROJECT_ADMIN
- PROJECT_MANAGER
- DEVELOPER
- QA
- VIEWER
- AI_AGENT

El sistema debe permitir que los roles tengan permisos configurables.

Separar:

- rol global;
- rol dentro de un proyecto.

Un usuario puede tener diferentes roles en diferentes proyectos.

---

# 5. ESTRUCTURA JERÁRQUICA

El sistema debe representar la jerarquía:

PROJECT
→ PHASE
→ EPIC
→ TEMPLATE
→ TASK
→ SUBTASK

Pero NO asumir que todos los niveles son obligatorios.

Una tarea debe poder indicar de qué instancia superior depende.

Ejemplo:

Proyecto
└── Fase
└── Epic
└── Task
├── Subtask
└── Subtask

Las subtareas pueden tener:

- diferente responsable;
- diferente estado;
- diferente avance;
- diferentes fechas;
- diferentes dependencias.

---

# 6. TAREAS

Cada tarea debe contener toda la información definida por el ROADMAP original.

Además debe permitir:

- título;
- descripción;
- instancia superior;
- fase;
- epic;
- template;
- responsable;
- tipo de responsable: HUMAN / AI_AGENT;
- estado;
- porcentaje de avance;
- prioridad;
- dependencias;
- fecha de creación;
- fecha de inicio;
- fecha estimada;
- fecha de finalización;
- subtareas;
- criterios de aceptación;
- información adicional definida por ROADMAP.

NO eliminar información del ROADMAP para simplificar la UI.

La interfaz puede organizarla por secciones.

---

# 7. ESTADOS KANBAN

El Kanban principal debe utilizar exactamente estos estados:

1. PENDIENTE
2. ASIGNADA
3. EN DESARROLLO
4. QA
5. TERMINADA

El sistema debe impedir estados inválidos.

Las transiciones deben estar controladas.

IMPORTANTE:

Una tarea puede cambiar de responsable mientras NO se encuentre en estado `EN DESARROLLO`.

Una vez que la tarea está en `EN DESARROLLO`, el responsable queda bloqueado salvo que un usuario con permisos especiales realice una reasignación explícita.

Registrar toda reasignación en auditoría.

---

# 8. ASIGNACIÓN

Una tarea puede asignarse a:

- usuario humano;
- agente IA.

El responsable debe visualizarse claramente en el Kanban y en el detalle.

Cuando una tarea sea asignada, el sistema debe actualizar el ROADMAP siguiendo la estructura definida por `skillProyectDocument`.

La asignación NO debe existir solamente en PostgreSQL.

Debe existir sincronización entre:

**Aplicación ↔ documentos del proyecto.**

---

# 9. CREACIÓN DE TAREAS

Si un usuario crea una tarea desde la aplicación:

NO permitir crear una tarea incompleta.

Debe completar toda la información obligatoria definida por ROADMAP.

Además debe indicar obligatoriamente:

**¿De qué instancia superior depende esta tarea?**

Por ejemplo:

- Phase
- Epic
- Template
- Task padre

Si corresponde.

El sistema debe validar la estructura antes de crear la tarea.

Una vez creada:

1. Persistir en PostgreSQL.
2. Actualizar el ROADMAP.
3. Registrar el cambio.
4. Crear registro de auditoría.
5. Actualizar la interfaz.
6. Detectar potenciales conflictos con cambios externos.

---

# 10. ROADMAP Y AGENTSLOG

La aplicación debe poder abrir y visualizar:

- ROADMAP
- AGENTSLOG / AGENT LOG

Debe existir una vista documental y una vista estructurada.

### Vista documental

Mostrar el contenido original con:

- búsqueda;
- navegación;
- resaltado;
- historial de cambios.

### Vista estructurada

Interpretar los documentos y convertirlos en:

- fases;
- épicas;
- tareas;
- subtareas;
- estados;
- responsables;
- avances;
- dependencias.

---

# 11. SINCRONIZACIÓN

Implementar un servicio de sincronización.

El sistema debe revisar periódicamente los archivos del proyecto.

Intervalo configurable:

`X minutos`

Ejemplo:

5 minutos.

Debe existir también:

**"Sincronizar ahora"**

para forzar inmediatamente la lectura de los archivos.

El sincronizador debe detectar:

- tareas nuevas;
- tareas eliminadas;
- cambios de estado;
- cambios de responsable;
- cambios de avance;
- nuevas subtareas;
- cambios en AGENTSLOG;
- modificaciones de ROADMAP.

---

# 12. CAMBIOS EXTERNOS

Los documentos pueden ser modificados fuera de la aplicación por:

- humanos;
- agentes IA;
- IDE;
- Git;
- scripts;
- otros sistemas.

Por eso la aplicación debe tratar los documentos como fuente externa potencialmente cambiante.

Cuando detecte un cambio:

1. Leer documento.
2. Parsearlo.
3. Compararlo con el estado anterior.
4. Identificar cambios.
5. Validar consistencia.
6. Actualizar PostgreSQL.
7. Registrar evento.
8. Actualizar dashboards.

No sobrescribir silenciosamente cambios externos.

Si existe conflicto:

**CONFLICT**

Debe quedar visible para un usuario autorizado.

---

# 13. AGENTSLOG

El AGENTSLOG debe utilizarse para obtener información operacional de los agentes.

Detectar, cuando exista información suficiente:

- qué agente está trabajando;
- qué tarea está ejecutando;
- cuándo comenzó;
- avances;
- acciones realizadas;
- bloqueos;
- errores;
- finalización;
- cambios de estado.

La aplicación debe correlacionar información de AGENTSLOG con ROADMAP mediante el identificador de tarea u otra clave establecida por la metodología documental.

---

# 14. DASHBOARD PRINCIPAL

Crear un dashboard moderno.

Debe mostrar como mínimo:

### Resumen

- proyectos activos;
- tareas totales;
- tareas pendientes;
- tareas asignadas;
- tareas en desarrollo;
- tareas en QA;
- tareas terminadas;
- tareas bloqueadas;
- avance global.

### Actividad

Mostrar:

- últimas tareas modificadas;
- últimos cambios de estado;
- últimas asignaciones;
- últimos eventos de agentes IA;
- últimos cambios detectados en documentos.

---

# 15. KANBAN

Crear un Kanban visual:

PENDIENTE | ASIGNADA | EN DESARROLLO | QA | TERMINADA

Cada tarjeta debe mostrar:

- ID;
- título;
- responsable;
- tipo de responsable;
- prioridad;
- porcentaje;
- fase;
- epic;
- dependencias;
- subtareas;
- fecha;
- indicadores de bloqueo.

Permitir:

- drag & drop;
- filtros;
- búsqueda;
- agrupamiento;
- ordenamiento.

El drag & drop debe respetar las reglas de transición y permisos.

---

# 16. AVANCE POR FASES

Crear una visualización jerárquica:

PROJECT
→ PHASE
→ EPIC
→ TASK
→ SUBTASK

Mostrar:

- porcentaje de avance;
- tareas terminadas;
- tareas en desarrollo;
- tareas pendientes;
- tareas bloqueadas.

El porcentaje de una instancia superior debe calcularse a partir de sus descendientes, utilizando una estrategia configurable y documentada.

No utilizar únicamente un porcentaje introducido manualmente si existen datos suficientes para calcularlo.

---

# 17. AVANCE INDIVIDUAL DE TAREAS

Cada tarea debe tener una vista detallada.

Mostrar:

- estado;
- porcentaje;
- responsable;
- jerarquía;
- dependencias;
- subtareas;
- avance de subtareas;
- historial;
- eventos;
- actividad de agentes;
- cambios realizados.

Si existen subtareas, mostrar también:

`Avance de la tarea = avance derivado de sus subtareas`

cuando corresponda.

---

# 18. ¿QUIÉN ESTÁ HACIENDO QUÉ?

Crear una vista:

**WORKLOAD / ACTIVITY**

Mostrar todos los actores activos.

Ejemplo:

| Actor  | Tipo     | Tarea              | Estado     | Avance |
| ------ | -------- | ------------------ | ---------- | ------ |
| Juan   | HUMAN    | Implementar API    | Desarrollo | 70%    |
| Codex  | AI_AGENT | Frontend Dashboard | Desarrollo | 45%    |
| Claude | AI_AGENT | QA                 | QA         | 80%    |

Permitir filtrar por:

- proyecto;
- usuario;
- agente;
- estado;
- fase;
- epic.

---

# 19. VISTA MULTIPROYECTO

Debe existir un nivel superior:

**MY PROJECTS**

Mostrar todos los proyectos del usuario.

Para cada proyecto:

- nombre;
- estado;
- avance;
- tareas activas;
- tareas atrasadas;
- agentes activos;
- última sincronización.

Permitir entrar rápidamente a cualquier proyecto.

---

# 20. GIT

La arquitectura debe estar preparada para integrar GitHub.

Inicialmente el MVP puede comenzar con repositorios Git y archivos Markdown.

Diseñar una capa de integración desacoplada:

`Project Repository Provider`

para permitir posteriormente:

- GitHub;
- GitLab;
- Bitbucket;
- repositorios locales;
- otros proveedores.

No acoplar toda la aplicación directamente a GitHub.

---

# 21. ARQUITECTURA

Utilizar arquitectura moderna y modular.

## Frontend

Angular última versión estable disponible al momento de implementación.

Usar:

- Angular;
- TypeScript;
- Angular Signals;
- standalone components;
- lazy loading;
- Angular Router;
- Reactive Forms;
- Angular Material o una librería UI moderna;
- CDK cuando corresponda.

La interfaz debe ser:

- responsive;
- desktop-first;
- accesible;
- rápida;
- moderna;
- consistente.

---

# 22. BACKEND

Utilizar:

**Node.js + TypeScript**

Framework recomendado:

**NestJS**

Arquitectura modular.

Separar claramente:

- Auth;
- Users;
- Projects;
- Project Members;
- Roles;
- Tasks;
- Subtasks;
- Phases;
- Epics;
- Templates;
- Agents;
- Roadmap;
- Agent Logs;
- Synchronization;
- Git Providers;
- Audit;
- Notifications.

---

# 23. DATABASE

Utilizar:

**PostgreSQL última versión estable compatible con el stack.**

ORM:

**Prisma**

Diseñar correctamente las relaciones.

Entidades mínimas:

- User
- Agent
- Project
- ProjectMember
- Role
- Permission
- ProjectRole
- Phase
- Epic
- Template
- Task
- TaskDependency
- TaskAssignment
- AuditEvent
- Document
- DocumentRevision
- SyncRun
- AgentLogEvent

Evitar duplicar innecesariamente información.

---

# 24. IDENTIFICACIÓN DE TAREAS

Cada tarea debe tener un identificador estable.

El ID debe permitir correlacionar:

**ROADMAP ↔ PostgreSQL ↔ AGENTSLOG ↔ aplicación**

Nunca utilizar únicamente el título para identificar una tarea.

---

# 25. AUDITORÍA

Registrar:

- creación;
- modificación;
- eliminación;
- asignación;
- reasignación;
- cambio de estado;
- cambio de avance;
- cambios provenientes de documentos;
- cambios realizados desde UI;
- sincronizaciones;
- conflictos.

Guardar:

- actor;
- fecha/hora;
- operación;
- entidad;
- valor anterior;
- valor nuevo;
- origen.

Origen:

- UI
- ROADMAP
- AGENTSLOG
- SYNC
- API
- SYSTEM

---

# 26. CONFLICTOS

Diseñar desde el MVP un mecanismo de detección de conflictos.

Ejemplo:

Usuario cambia tarea en aplicación.

Simultáneamente un agente modifica ROADMAP.

El sistema debe detectar que el documento cambió desde la última versión conocida.

NO sobrescribir automáticamente.

Mostrar:

- versión local;
- versión externa;
- diferencias;
- opción de resolver.

---

# 27. API

Crear API REST bien estructurada.

Preparar arquitectura para agregar posteriormente:

- WebSockets;
- eventos;
- integración con agentes IA;
- webhooks GitHub;
- MCP;
- automatizaciones.

La aplicación debe poder evolucionar hacia una plataforma donde los agentes IA puedan consultar y modificar tareas mediante API controlada.

---

# 28. SEGURIDAD

Implementar:

- autenticación;
- autorización;
- RBAC;
- validación de inputs;
- protección contra inyección;
- rate limiting;
- auditoría;
- gestión segura de credenciales;
- secrets mediante variables de entorno;
- no almacenar API keys en texto plano.

---

# 29. NOTIFICACIONES

Preparar infraestructura para notificaciones.

Eventos:

- tarea asignada;
- tarea reasignada;
- tarea pasa a QA;
- tarea terminada;
- bloqueo;
- conflicto;
- error de sincronización;
- agente detenido;
- cambio externo.

El MVP puede comenzar con notificaciones internas.

---

# 30. UX

La aplicación debe sentirse como una combinación moderna de:

- Linear;
- Jira;
- GitHub Projects;
- Notion;
- herramientas de gestión de agentes IA.

Pero NO copiar visualmente ninguna aplicación.

Priorizar:

- claridad;
- velocidad;
- densidad de información;
- navegación simple;
- jerarquía visual;
- acciones rápidas.

---

# 31. MVP

NO intentar desarrollar todo el sistema futuro.

El MVP funcional debe incluir obligatoriamente:

### Proyectos

- múltiples proyectos;
- creación;
- edición;
- listado;
- acceso por proyecto.

### Usuarios

- usuarios humanos;
- agentes IA;
- roles;
- permisos básicos.

### Documentos

- ROADMAP;
- AGENTSLOG;
- lectura;
- parsing;
- sincronización.

### Tareas

- CRUD;
- jerarquía;
- asignación;
- subtareas;
- estados;
- avance;
- dependencias.

### Visualizaciones

- Kanban;
- avance por fases;
- detalle de tarea;
- workload por usuario/agente.

### Sincronización

- automática cada X minutos;
- sincronización manual;
- detección de cambios.

### Auditoría

- historial de cambios.

---

# 32. DATOS DEMO

Crear seed data para demostrar el funcionamiento.

Crear:

- 2 o 3 proyectos;
- usuarios humanos;
- agentes IA;
- fases;
- épicas;
- tareas;
- subtareas;
- diferentes estados;
- diferentes responsables;
- dependencias.

Los datos demo deben respetar la estructura real descubierta en `skillProyectDocument`.

---

# 33. TESTING

Implementar:

### Backend

- unit tests;
- integration tests;
- tests de API.

### Frontend

- unit tests;
- component tests.

### E2E

Probar como mínimo:

1. crear proyecto;
2. agregar usuario;
3. agregar agente;
4. crear tarea;
5. asignar tarea;
6. crear subtarea;
7. cambiar estado;
8. cambiar avance;
9. intentar reasignar tarea en desarrollo;
10. sincronizar ROADMAP;
11. detectar cambio externo;
12. visualizar Kanban;
13. visualizar avance;
14. visualizar workload.

---

# 34. CALIDAD DEL CÓDIGO

Utilizar:

- TypeScript strict;
- ESLint;
- Prettier;
- Husky;
- lint-staged;
- convenciones de commits;
- variables de entorno;
- configuración separada por ambiente.

No generar código innecesario.

No crear abstracciones prematuras.

Mantener módulos pequeños y cohesivos.

---

# 35. DOCUMENTACIÓN

Crear:

- README;
- arquitectura;
- instalación;
- configuración;
- modelo de datos;
- API;
- estrategia de sincronización;
- estrategia de parsing;
- reglas de negocio;
- permisos;
- testing;
- decisiones arquitectónicas.

Crear también:

`docs/architecture.md`

`docs/domain-model.md`

`docs/synchronization.md`

`docs/roadmap-parser.md`

---

# 36. PLAN DE DESARROLLO

Trabajar incrementalmente.

FASE 1
Analizar `skillProyectDocument`.

FASE 2
Definir arquitectura y modelo de dominio.

FASE 3
Crear proyecto Angular + Node/NestJS + PostgreSQL.

FASE 4
Implementar autenticación y usuarios.

FASE 5
Implementar proyectos y roles.

FASE 6
Implementar parser ROADMAP/AGENTSLOG.

FASE 7
Implementar tareas y jerarquía.

FASE 8
Implementar sincronización.

FASE 9
Implementar Kanban.

FASE 10
Implementar dashboard y métricas.

FASE 11
Implementar workload humano + IA.

FASE 12
Testing integral y estabilización.

---

# 37. REGLA DE DESARROLLO AUTÓNOMO

Después de completar cada punto:

1. Ejecutar todos los tests relevantes.
2. Ejecutar lint.
3. Ejecutar build.
4. Corregir cualquier error.
5. Volver a ejecutar los tests.
6. Solo continuar cuando todo esté GREEN.
7. Registrar lo realizado.
8. Crear commit.
9. Push a la rama `develop`.
10. Continuar automáticamente con el siguiente punto pendiente.

Nunca marcar una funcionalidad como terminada si los tests correspondientes no están GREEN.

---

# 38. REGLA DE NO DEGRADACIÓN

Antes de modificar una funcionalidad existente:

- analizar su comportamiento;
- identificar dependencias;
- ejecutar tests existentes;
- preservar compatibilidad.

No romper funcionalidades existentes para implementar nuevas.

---

# 39. RESULTADO ESPERADO

Al finalizar el MVP debe existir una aplicación funcional donde pueda:

1. Entrar al sistema.
2. Ver múltiples proyectos.
3. Entrar a un proyecto.
4. Leer su ROADMAP y AGENTSLOG.
5. Ver automáticamente las fases, épicas, tareas y subtareas.
6. Ver quién tiene asignada cada tarea.
7. Ver humanos y agentes IA como responsables.
8. Ver las tareas en Kanban.
9. Ver el avance de cada tarea.
10. Ver el avance por fases/épicas.
11. Ver qué está haciendo cada humano o agente.
12. Crear y modificar tareas respetando la estructura del ROADMAP.
13. Detectar cambios realizados externamente.
14. Sincronizar manualmente.
15. Sincronizar automáticamente.
16. Auditar los cambios.
17. Detectar conflictos.
18. Mantener ROADMAP, AGENTSLOG, PostgreSQL y la interfaz coherentes.

# PRINCIPIO FINAL

La aplicación NO debe ser simplemente otro gestor de tareas.

Debe ser una **capa de coordinación entre humanos, agentes IA y los documentos que definen el proyecto**.

El objetivo es que un proyecto pueda continuar siendo desarrollado por diferentes agentes y personas, mientras la aplicación mantiene una visión centralizada, actualizada y auditable de:

**QUÉ HAY QUE HACER → QUIÉN LO HACE → EN QUÉ ESTADO ESTÁ → CUÁNTO AVANZÓ → DE QUÉ DEPENDE → QUÉ OCURRIÓ → QUÉ CAMBIÓ.**
