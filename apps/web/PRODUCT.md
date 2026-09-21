# Product

<!-- impeccable:product-schema 1 -->

<!-- Inferred, not interviewed (2026-09-15): written while working autonomously under the user's standing instruction to proceed without pausing. Every fact comes from the project brief ("Prompt — Desarrollo de Project Management Hub Humano + IA.md", cited as §N) or docs/ProductDescription.md. Confirm or correct with /impeccable init. -->

## Platform

web

## Users

People who coordinate software projects whose work is split between humans and AI agents (Codex, Claude, Gemini, custom agents): owners, project admins and project managers who create, assign and track work, and developers or QA who move their own tasks through the board (§3, §4). They return to the hub many times a day, alongside their IDE, terminal and the project's Markdown documents (inferred from §10–§13).

## Product Purpose

PM Hub is a coordination layer between humans, AI agents and the documents that define each project (`Roadmap.md`, `Agentslog.md`). It keeps a centralized, current and auditable view of what has to be done, who is doing it, its state, progress and dependencies, what happened and what changed (§ "Principio final"). Success means anyone can open a project and trust that the board, the documents and the database agree.

## Positioning

Unlike a generic task tracker, each project's own Markdown documents remain the source of truth: the hub parses and synchronizes them, writes changes back surgically, and surfaces conflicts for a person to resolve instead of silently overwriting either side (§11, §12, §26). Humans and AI agents are first-class, interchangeable assignees (§3, §8).

## Operating Context

- Several projects per person, each backed by a Git repository whose docs follow the project-documentation skill (§1, §19, §20).
- Scheduled and manual ("Sincronizar ahora") synchronization; conflicts resolved by authorized people (§11, §26).
- Kanban with exactly five states — PENDIENTE, ASIGNADA, EN DESARROLLO, QA, TERMINADA — and the assignee locked while EN DESARROLLO (§7).
- Desktop-first on large screens, still usable on narrow ones (§21).

## Capabilities and Constraints

- Angular (latest) with Angular Material/CDK on the front end; NestJS and PostgreSQL behind it (§21–§23).
- Views: dashboard, my projects, workload ("¿quién está haciendo qué?"), team of humans and agents, and per project: Kanban, progress by phase, documents (documental and structured), conflicts, audit history, task detail (§14–§19, §25).
- RBAC with global and per-project roles; actors are active or inactive (§3, §4).
- Interface copy is Spanish (`lang="es"`, `es-ES` dates); API enums are shown through a label dictionary, and Kanban state names are Spanish domain terms that stay verbatim.

## Brand Commitments

- Name: PM Hub.
- It should feel like a modern combination of Linear, Jira, GitHub Projects, Notion and AI-agent management tools, without visually copying any of them (§30).
- Priorities: clarity, speed, information density, simple navigation, visual hierarchy, quick actions (§30).

## Evidence on Hand

- Seeded demo data only: projects "PM Hub (this repo)", "Website Relaunch", "Mobile App Revamp"; actors Demo Human, Ana García, Demo Agent, Codex (`apps/api/prisma/seed.ts`).
- No logo, customers, testimonials or marketing assets exist; none may be invented.

## Product Principles

1. The documents are the source of truth; the interface never hides a disagreement between documents and database.
2. Humans and AI agents are shown and handled the same way, with their kind always visible.
3. Every change is attributable: who, when, and from where.
4. Density over decoration: the tool disappears into the task.

## Accessibility & Inclusion

The brief requires an accessible interface (§21). Target WCAG 2.2 AA (inferred standard, not stated in the brief).
