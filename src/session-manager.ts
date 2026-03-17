/**
 * Session manager for tracking Claude CLI session IDs across subprocess restarts.
 *
 * When a subprocess completes (result message), it returns a session_id.
 * On subsequent requests, we pass --resume <session_id> so the CLI loads
 * the prior conversation context from disk instead of replaying the full
 * flattened prompt. This eliminates:
 * - Quadratic token growth from replaying full history
 * - Redundant reprocessing of identical context
 *
 * Sessions are keyed by working directory since the CLI persists session
 * files relative to cwd.
 */

/** Map from cwd to the most recent session_id for that directory. */
const sessions = new Map<string, string>();

/**
 * Store a session ID for the given working directory.
 */
export function setSessionId(cwd: string, sessionId: string): void {
  sessions.set(cwd, sessionId);
}

/**
 * Get the session ID for the given working directory, if one exists.
 */
export function getSessionId(cwd: string): string | undefined {
  return sessions.get(cwd);
}

/**
 * Clear the session ID for the given working directory.
 * Called when a session becomes invalid (e.g., subprocess error).
 */
export function clearSessionId(cwd: string): void {
  sessions.delete(cwd);
}

/**
 * Clear all tracked sessions. Used in teardown.
 */
export function clearAllSessions(): void {
  sessions.clear();
}
