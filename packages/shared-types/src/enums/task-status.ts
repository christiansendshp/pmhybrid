/**
 * Kanban states, per brief §7 / docs/domain-model.md. Written verbatim into a
 * managed project's Roadmap.md Status cell (ADR-002, docs/Stack_Tecnologies.md).
 */
export enum TaskStatus {
  PENDIENTE = 'PENDIENTE',
  ASIGNADA = 'ASIGNADA',
  EN_DESARROLLO = 'EN_DESARROLLO',
  QA = 'QA',
  TERMINADA = 'TERMINADA',
}
