/**
 * Which table of a managed project's Roadmap.md a Task's row currently
 * sits in. Table membership is itself a status signal, independent of
 * TaskStatus — see docs/synchronization.md.
 */
export enum RoadmapTable {
  ACTIVE = 'ACTIVE',
  NEAR_TERM = 'NEAR_TERM',
  BLOCKED = 'BLOCKED',
}
