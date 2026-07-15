import { describe, expect, it } from "vitest";

import type { AgentEvent } from "../../../shared/contracts/capture";
import { buildExecutionFlow } from "./buildExecutionFlow";

function event(
  sequence: number,
  source: AgentEvent["source"],
  kind: AgentEvent["kind"],
  summary: string,
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
    summary,
    payload,
  };
}

describe("buildExecutionFlow", () => {
  it("groups a noisy event stream into user phases and semantic nodes", () => {
    const flow = buildExecutionFlow([
      event(1, "user", "message", "实现流程图"),
      event(2, "agent", "message", "先检查真实事件格式"),
      event(3, "tool", "tool_call", "执行终端命令", {
        toolName: "exec",
        toolCategory: "command",
        operation: "执行终端命令",
      }),
      event(4, "tool", "tool_result", "完成"),
      event(5, "tool", "tool_call", "执行终端命令", {
        toolName: "exec",
        toolCategory: "command",
        operation: "执行终端命令",
      }),
      event(6, "tool", "tool_call", "读取 Skill", {
        toolCategory: "skill",
        skillName: "openai-docs",
      }),
      event(7, "tool", "tool_call", "调用 MCP", {
        toolName: "mcp__docs__search",
        toolCategory: "mcp",
        mcpServer: "docs",
      }),
      event(8, "tool", "tool_result", "failed", { failed: true }, "error"),
      event(9, "user", "message", "继续优化"),
      event(10, "agent", "message", "完成第二阶段"),
      event(11, "tool", "tool_call", "执行高危命令", {
        toolName: "exec",
        toolCategory: "command",
        commands: ["git reset --hard"],
      }),
    ]);

    expect(flow.phases).toHaveLength(2);
    expect(flow.phases[0]?.nodes.find((node) => node.kind === "command")?.count).toBe(2);
    expect(flow.metrics.skills).toBe(1);
    expect(flow.metrics.mcpCalls).toBe(1);
    expect(flow.metrics.errors).toBe(1);
    expect(flow.metrics.commands).toBe(3);
    expect(flow.metrics.riskyOperations).toBe(1);
    expect(
      flow.phases.flatMap((phase) => phase.nodes).find((node) => node.riskLevel === "high")
        ?.riskReason,
    ).toContain("丢弃本地代码修改");
  });
});
