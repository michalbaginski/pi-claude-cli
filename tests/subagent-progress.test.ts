import { describe, expect, it } from "vitest";
import type { ClaudeApiEvent, ClaudeSystemMessage } from "../src/types.js";
import { CUSTOM_TOOLS_MCP_PREFIX } from "../src/tool-mapping.js";
import { createSubAgentProgressTracker } from "../src/subagent-progress.js";

const parentToolUseId = "parent-tool";

function startParentEvent(
  tracker: ReturnType<typeof createSubAgentProgressTracker>,
) {
  tracker.handleEvent({
    type: "content_block_start",
    index: 0,
    content_block: {
      type: "tool_use",
      id: parentToolUseId,
      name: "Parent Agent",
    },
  });
}

function createToolUseStart(
  id: string,
  name: string,
  index = 0,
): ClaudeApiEvent {
  return {
    type: "content_block_start",
    index,
    content_block: {
      type: "tool_use",
      id,
      name,
    },
  };
}

function createDelta(partialJson: string, index = 0): ClaudeApiEvent {
  return {
    type: "content_block_delta",
    index,
    delta: {
      type: "input_json_delta",
      partial_json: partialJson,
    },
  };
}

function createStop(index = 0): ClaudeApiEvent {
  return {
    type: "content_block_stop",
    index,
  };
}

describe("SubAgentProgressTracker - tool events", () => {
  it("formats status lines with parsed args", () => {
    const tracker = createSubAgentProgressTracker();
    startParentEvent(tracker);

    tracker.handleEvent(
      createToolUseStart("child-tool", "read"),
      parentToolUseId,
    );
    tracker.handleEvent(
      createDelta('{"file_path":"examples/config.json"}'),
      parentToolUseId,
    );
    const status = tracker.handleEvent(createStop(), parentToolUseId);

    expect(status).toBe("Parent Agent: running read examples/config.json");
  });

  it("ignores invalid JSON in partial args", () => {
    const tracker = createSubAgentProgressTracker();
    startParentEvent(tracker);

    tracker.handleEvent(
      createToolUseStart("child-tool", "read"),
      parentToolUseId,
    );
    tracker.handleEvent(createDelta("{bad"), parentToolUseId);
    const status = tracker.handleEvent(createStop(), parentToolUseId);

    expect(status).toBe("Parent Agent: running read");
  });

  it("strips MCP prefixes and falls back to description args", () => {
    const tracker = createSubAgentProgressTracker();
    startParentEvent(tracker);

    tracker.handleEvent(
      createToolUseStart("child-tool", `${CUSTOM_TOOLS_MCP_PREFIX}deploy`),
      parentToolUseId,
    );
    tracker.handleEvent(
      createDelta('{"description":"Deploy changes"}'),
      parentToolUseId,
    );
    const status = tracker.handleEvent(createStop(), parentToolUseId);

    expect(status).toBe("Parent Agent: running deploy Deploy changes");
  });
});

describe("SubAgentProgressTracker - system messages", () => {
  it("handles task_started, task_progress, and notifications", () => {
    const tracker = createSubAgentProgressTracker();
    startParentEvent(tracker);

    const started = tracker.handleSystemMessage({
      type: "system",
      subtype: "task_started",
      tool_use_id: parentToolUseId,
      description: "  prepping work  ",
    });
    expect(started).toBe("Parent Agent: started prepping work");

    const progressTool = tracker.handleSystemMessage({
      type: "system",
      subtype: "task_progress",
      tool_use_id: parentToolUseId,
      last_tool_name: "Read",
      description: "running read file",
    });
    expect(progressTool).toBe("Parent Agent: running Read read file");

    const progressNoTool = tracker.handleSystemMessage({
      type: "system",
      subtype: "task_progress",
      tool_use_id: parentToolUseId,
      description: "Ongoing check",
    });
    expect(progressNoTool).toBe("Parent Agent: Ongoing check");

    const completedSummary = tracker.handleSystemMessage({
      type: "system",
      subtype: "task_notification",
      tool_use_id: parentToolUseId,
      status: "completed",
      summary: "All done",
    });
    expect(completedSummary).toBe("Parent Agent: completed All done");

    const completedDescription = tracker.handleSystemMessage({
      type: "system",
      subtype: "task_notification",
      tool_use_id: parentToolUseId,
      status: "completed",
      summary: "  ",
      description: "Wrapped up",
    });
    expect(completedDescription).toBe("Parent Agent: completed Wrapped up");

    const completedPlain = tracker.handleSystemMessage({
      type: "system",
      subtype: "task_notification",
      tool_use_id: parentToolUseId,
      status: "completed",
    });
    expect(completedPlain).toBe("Parent Agent: completed");
  });

  it("returns null when no tool_use_id is provided", () => {
    const tracker = createSubAgentProgressTracker();

    const result = tracker.handleSystemMessage({
      type: "system",
      subtype: "task_started",
    } as ClaudeSystemMessage);
    expect(result).toBeNull();
  });
});
