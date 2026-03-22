import type { ClaudeApiEvent, ClaudeSystemMessage } from "./types.js";
import { CUSTOM_TOOLS_MCP_PREFIX } from "./tool-mapping.js";

interface OpenToolUseBlock {
  parentToolUseId: string;
  index: number;
  id?: string;
  name: string;
  partialJson: string;
}

export interface SubAgentProgressTracker {
  handleEvent(
    event: ClaudeApiEvent,
    parentToolUseId?: string | null,
  ): string | null;
  handleSystemMessage(message: ClaudeSystemMessage): string | null;
}

function parseArgs(partialJson: string): Record<string, unknown> {
  if (!partialJson) return {};
  try {
    const parsed = JSON.parse(partialJson);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function truncate(value: string, max = 80): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function firstStringArg(
  args: Record<string, unknown>,
  names: string[],
): string | undefined {
  for (const name of names) {
    const value = args[name];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function formatToolName(toolName: string): string {
  return toolName.startsWith(CUSTOM_TOOLS_MCP_PREFIX)
    ? toolName.slice(CUSTOM_TOOLS_MCP_PREFIX.length)
    : toolName;
}

function stripLeadingGerund(detail: string): string {
  return detail.replace(
    /^(reading|writing|editing|grepping|searching|running)\s+/i,
    "",
  );
}

function formatToolDetail(
  toolName: string,
  args: Record<string, unknown>,
): string | undefined {
  const normalizedName = toolName.toLowerCase();

  if (
    normalizedName === "read" ||
    normalizedName === "write" ||
    normalizedName === "edit"
  ) {
    return firstStringArg(args, ["file_path", "path"]);
  }

  if (normalizedName === "bash") {
    return firstStringArg(args, ["command", "cmd"]);
  }

  if (normalizedName === "grep") {
    const pattern = firstStringArg(args, ["pattern", "query"]);
    const path = firstStringArg(args, ["path", "file_path"]);
    if (pattern && path) return `${pattern} in ${path}`;
    return pattern ?? path;
  }

  if (normalizedName === "glob") {
    return firstStringArg(args, ["pattern", "path"]);
  }

  return firstStringArg(args, [
    "description",
    "task",
    "prompt",
    "goal",
    "query",
    "command",
    "name",
  ]);
}

export function createSubAgentProgressTracker(): SubAgentProgressTracker {
  const openBlocks = new Map<string, OpenToolUseBlock>();
  const toolNamesById = new Map<string, string>();

  function getBlockKey(parentToolUseId: string, index: number): string {
    return `${parentToolUseId}:${index}`;
  }

  function formatStatusLine(block: OpenToolUseBlock): string {
    const parentLabel = toolNamesById.get(block.parentToolUseId) ?? "Sub-agent";
    const toolLabel = formatToolName(block.name);
    const args = parseArgs(block.partialJson);
    const detail = formatToolDetail(block.name, args);

    return detail
      ? `${parentLabel}: running ${toolLabel} ${truncate(detail)}`
      : `${parentLabel}: running ${toolLabel}`;
  }

  return {
    handleEvent(event, parentToolUseId) {
      if (
        event.type === "content_block_start" &&
        event.content_block?.type === "tool_use"
      ) {
        const toolId = event.content_block.id;
        const toolName = event.content_block.name;

        if (toolId && toolName) {
          toolNamesById.set(toolId, toolName);
        }

        if (parentToolUseId && toolName) {
          openBlocks.set(getBlockKey(parentToolUseId, event.index ?? 0), {
            parentToolUseId,
            index: event.index ?? 0,
            id: toolId,
            name: toolName,
            partialJson: "",
          });
        }

        return null;
      }

      if (!parentToolUseId) {
        return null;
      }

      const key = getBlockKey(parentToolUseId, event.index ?? 0);
      const block = openBlocks.get(key);
      if (!block) {
        return null;
      }

      if (
        event.type === "content_block_delta" &&
        event.delta?.type === "input_json_delta" &&
        event.delta.partial_json != null
      ) {
        block.partialJson += event.delta.partial_json;
        return null;
      }

      if (event.type === "content_block_stop") {
        openBlocks.delete(key);
        return formatStatusLine(block);
      }

      return null;
    },
    handleSystemMessage(message) {
      const toolUseId = message.tool_use_id;
      if (!toolUseId) return null;

      const parentLabel = toolNamesById.get(toolUseId) ?? "Agent";

      if (message.subtype === "task_started") {
        const description = message.description?.trim();
        return description
          ? `${parentLabel}: started ${description}`
          : `${parentLabel}: started`;
      }

      if (message.subtype === "task_progress") {
        const toolLabel = message.last_tool_name
          ? formatToolName(message.last_tool_name)
          : undefined;
        const description = message.description?.trim();

        if (toolLabel && description) {
          return `${parentLabel}: running ${toolLabel} ${truncate(stripLeadingGerund(description))}`;
        }

        if (toolLabel) {
          return `${parentLabel}: running ${toolLabel}`;
        }

        if (description) {
          return `${parentLabel}: ${truncate(description)}`;
        }
      }

      if (
        message.subtype === "task_notification" &&
        message.status === "completed"
      ) {
        const summary = message.summary?.trim() || message.description?.trim();
        return summary
          ? `${parentLabel}: completed ${truncate(summary)}`
          : `${parentLabel}: completed`;
      }

      return null;
    },
  };
}
