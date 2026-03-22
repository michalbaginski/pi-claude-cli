/**
 * Session manager for tracking Claude CLI session IDs across subprocess turns.
 *
 * The provider falls back to a cwd-scoped session when pi does not supply a
 * stable sessionId option. Without this, every follow-up turn replays the full
 * flattened conversation and token usage grows unnecessarily.
 */

const sessionIds = new Map<string, string>();

export function getSessionId(key: string): string | undefined {
  return sessionIds.get(key);
}

export function setSessionId(key: string, sessionId: string): void {
  if (!key || !sessionId) return;
  sessionIds.set(key, sessionId);
}

export function clearSessionId(key: string): void {
  sessionIds.delete(key);
}

export function clearAllSessionIds(): void {
  sessionIds.clear();
}
