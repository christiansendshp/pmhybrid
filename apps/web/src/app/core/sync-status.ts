/** What a sync run's status means to a person (Roadmap UX-01): the raw enum is not something to read. */
const LABELS: Record<string, string> = {
  SUCCESS: 'correcta',
  PARTIAL: 'con avisos',
  FAILED: 'fallida',
  RUNNING: 'en curso',
};

export function syncStatusLabel(status: string): string {
  return LABELS[status] ?? status.toLowerCase();
}

/** A run that needs a person: it failed, or it finished leaving conflicts or unreadable Roadmap entries. */
export function syncNeedsAttention(status: string): boolean {
  return status === 'FAILED' || status === 'PARTIAL';
}
