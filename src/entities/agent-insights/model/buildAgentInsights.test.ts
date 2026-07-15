import { describe, expect, it } from "vitest";

import type { AgentEvent } from "../../../shared/contracts/capture";
import { buildAgentInsights } from "./buildAgentInsights";

function event(
  sequence: number,
  kind: AgentEvent["kind"],
  source: AgentEvent["source"],
  payload: Record<string, unknown> = {},
  level: AgentEvent["level"] = "info",
): AgentEvent {
  return {
    id: `00000000-0000-4000-8000-${sequence.toString().padStart(12, "0")}`,
    sessionId: "00000000-0000-4000-8000-000000000999",
    sequence,
    timestamp: `2026-07-15T00:00:${sequence.toString().padStart(2, "0")}Z`,
    source,
    kind,
    level,
    summary: kind,
    payload,
  };
}

describe("buildAgentInsights", () => {
  it("summarizes only agent transcript events", () => {
    const result = buildAgentInsights([
      event(1, "message", "user"),
      event(2, "message", "agent"),
      event(3, "tool_call", "tool", {
        toolName: "exec",
        toolCategory: "command",
        commands: ["git status --short", "cargo test"],
      }),
      event(4, "tool_call", "tool", { toolName: "read", skillName: "openai-docs" }),
      event(5, "tool_call", "tool", { toolName: "mcp__docs", mcpServer: "docs" }),
      event(6, "tool_result", "tool", { failed: true }, "error"),
    ]);

    expect(result.userMessages).toBe(1);
    expect(result.agentMessages).toBe(1);
    expect(result.toolCalls).toBe(3);
    expect(result.skills).toBe(1);
    expect(result.mcpCalls).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.commands).toBe(2);
    expect(result.topTools[0]?.name).toBe("exec");
    expect(result.topCommands.map((item) => item.name)).toContain("git status");
  });
});
