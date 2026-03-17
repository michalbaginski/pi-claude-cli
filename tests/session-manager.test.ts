import { describe, it, expect, beforeEach } from "vitest";
import {
  setSessionId,
  getSessionId,
  clearSessionId,
  clearAllSessions,
} from "../src/session-manager";

describe("session-manager", () => {
  beforeEach(() => {
    clearAllSessions();
  });

  it("returns undefined when no session is set", () => {
    expect(getSessionId("/some/path")).toBeUndefined();
  });

  it("stores and retrieves session ID by cwd", () => {
    setSessionId("/project/a", "session-123");
    expect(getSessionId("/project/a")).toBe("session-123");
  });

  it("returns undefined for different cwd", () => {
    setSessionId("/project/a", "session-123");
    expect(getSessionId("/project/b")).toBeUndefined();
  });

  it("overwrites session ID on subsequent set", () => {
    setSessionId("/project/a", "session-1");
    setSessionId("/project/a", "session-2");
    expect(getSessionId("/project/a")).toBe("session-2");
  });

  it("clears session ID for specific cwd", () => {
    setSessionId("/project/a", "session-1");
    setSessionId("/project/b", "session-2");

    clearSessionId("/project/a");

    expect(getSessionId("/project/a")).toBeUndefined();
    expect(getSessionId("/project/b")).toBe("session-2");
  });

  it("clearSessionId no-ops for nonexistent cwd", () => {
    expect(() => clearSessionId("/nonexistent")).not.toThrow();
  });

  it("clearAllSessions removes all tracked sessions", () => {
    setSessionId("/project/a", "session-1");
    setSessionId("/project/b", "session-2");

    clearAllSessions();

    expect(getSessionId("/project/a")).toBeUndefined();
    expect(getSessionId("/project/b")).toBeUndefined();
  });
});
