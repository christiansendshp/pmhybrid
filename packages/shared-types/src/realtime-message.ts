/**
 * Messages pushed over the notifications WebSocket gateway (Roadmap GAP-26).
 * A single variant today — a refetch signal, not the notification content
 * itself, so the REST list endpoint stays the one source of truth for shape.
 * A discriminated union so future push types are additive.
 */
export type RealtimeMessage = { type: 'notifications.changed' };
