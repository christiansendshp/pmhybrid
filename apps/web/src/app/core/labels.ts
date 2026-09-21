/**
 * What an enum value means to a person (Roadmap UX-03a): the API speaks in
 * SCREAMING_SNAKE codes, the screen speaks Spanish. One dictionary per kind of
 * value, one fallback for a code nobody has named yet, so a new operation on
 * the server shows up readable instead of as `SOMETHING_NEW`.
 */
export type LabelKind =
  | 'operation'
  | 'origin'
  | 'entity'
  | 'conflictKind'
  | 'resolution'
  | 'revisionSource'
  | 'documentKind'
  | 'roadmapTable'
  | 'priority'
  | 'ledgerState';

const DICTIONARIES: Record<LabelKind, Record<string, string>> = {
  operation: {
    CREATE: 'Creación',
    UPDATE: 'Edición',
    DELETE: 'Eliminación',
    STATUS_CHANGE: 'Cambio de estado',
    PROGRESS_CHANGE: 'Cambio de avance',
    ASSIGN: 'Asignación',
    REASSIGN: 'Reasignación',
    UNASSIGN: 'Desasignación',
    DEPENDENCY_ADD: 'Dependencia añadida',
    DEPENDENCY_REMOVE: 'Dependencia quitada',
    MEMBER_ADD: 'Miembro añadido',
    MEMBER_REMOVE: 'Miembro quitado',
    ROLE_ASSIGN: 'Rol asignado',
    ROLE_REVOKE: 'Rol retirado',
    ROLE_PERMISSIONS_UPDATE: 'Permisos del rol editados',
    API_KEY_CREATE: 'Clave de API creada',
    API_KEY_REVOKE: 'Clave de API revocada',
    PASSWORD_CHANGE: 'Contraseña cambiada',
    SYNC_RUN: 'Sincronización',
    WRITE_BACK: 'Escritura en el documento',
    WRITE_BACK_AGENTSLOG_ONLY: 'Escritura solo en el registro',
    WRITE_BACK_DEFERRED: 'Escritura aplazada',
    ROADMAP_FIELD_UPDATE: 'Campo actualizado desde el Roadmap',
    ROADMAP_TABLE_CHANGE: 'Cambio de tabla del Roadmap',
    COMPLETE_VIA_ROADMAP_REMOVAL: 'Completada al salir del Roadmap',
    CONFLICT_DETECTED: 'Conflicto detectado',
    CONFLICT_RESOLVED: 'Conflicto resuelto',
  },
  origin: {
    UI: 'Aplicación',
    API: 'API',
    ROADMAP: 'Roadmap',
    AGENTSLOG: 'Registro de agentes',
    SYNC: 'Sincronización',
    SYSTEM: 'Sistema',
  },
  entity: {
    Task: 'Tarea',
    Project: 'Proyecto',
    Phase: 'Fase',
    Epic: 'Épica',
    Template: 'Plantilla',
    Actor: 'Persona o agente',
    ActorRole: 'Rol asignado',
    Role: 'Rol',
    ProjectMember: 'Miembro',
    ApiKey: 'Clave de API',
    SyncRun: 'Sincronización',
    TaskComment: 'Comentario',
  },
  conflictKind: {
    ROADMAP_ROW_DISAPPEARED_NO_TERMINAL_LOG: 'Fila desaparecida del Roadmap',
    CONCURRENT_FIELD_EDIT: 'Edición simultánea',
    WRITE_BACK_COLLISION: 'Colisión al escribir en el documento',
    UNRECOGNIZED_STATUS: 'Estado no reconocido',
  },
  resolution: {
    KEEP_LOCAL: 'se conservó el valor de PM Hub',
    KEEP_EXTERNAL: 'se conservó el valor del documento',
    MANUAL_EDIT: 'se editó a mano',
    DISMISSED: 'se descartó',
  },
  revisionSource: {
    SYNC: 'Sincronización',
    UI: 'Aplicación',
  },
  documentKind: {
    ROADMAP: 'Roadmap',
    AGENTSLOG: 'Registro de agentes',
    PRODUCT_DESCRIPTION: 'Descripción del producto',
    STACK_TECH: 'Stack técnico',
    FEATURES: 'Funcionalidades',
    AGENTS_RULES: 'Reglas para agentes',
  },
  roadmapTable: {
    ACTIVE: 'Trabajo activo',
    NEAR_TERM: 'Próximamente',
    BLOCKED: 'Bloqueada',
  },
  priority: {
    LOW: 'Baja',
    MEDIUM: 'Media',
    HIGH: 'Alta',
    CRITICAL: 'Crítica',
  },
  ledgerState: {
    IN_PROGRESS: 'En curso',
    PAUSE: 'En pausa',
    DONE: 'Hecha',
    CREATED: 'Creada',
    REASSIGNED: 'Reasignada',
    REMOVED: 'Eliminada',
  },
};

/** `SOME_CODE` -> `Some code`: readable enough for a code nobody has named. */
function humanize(code: string): string {
  const spaced = code.replace(/_/g, ' ').trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The Spanish label of `value` in the given dictionary; empty values read as a dash. */
export function label(kind: LabelKind, value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  return DICTIONARIES[kind][value] ?? humanize(value);
}
