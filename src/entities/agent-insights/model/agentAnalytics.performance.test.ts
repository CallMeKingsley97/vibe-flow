import { describe, expect, it } from "vitest";

import type { AgentEvent } from "../../../shared/contracts/capture";
import { buildExecutionFlow } from "../../execution-flow/model/buildExecutionFlow";
import { buildAgentInsights } from "./buildAgentInsights";

function fixtureEvents(count: number): AgentEvent[] {
  const sessionId = "00000000-0000-4000-8000-000000000088";
  return Array.from({ length: count }, (_, index) => {
    const sequence = index + 1;
    const phasePosition = index % 40;
    const kind: AgentEvent["kind"] =
      phasePosition === 0 ? "message" : phasePosition % 5 === 0 ? "tool_call" : "message";
    const source: AgentEvent["source"] =
      phasePosition === 0 ? "user" : kind === "tool_call" ? "tool" : "agent";
    return {
      id: `00000000-0000-4000-8001-${sequence.toString().padStart(12, "0")}`,
      sessionId,
      sequence,
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, sequence)).toISOString(),
      source,
      kind,
      level: "info",
      summary: phasePosition === 0 ? `阶段 ${Math.floor(index / 40) + 1}` : `事件 ${sequence}`,
      payload:
        kind === "tool_call"
          ? { toolName: "exec", toolCategory: "command", command: "cargo test" }
          : {},
    };
  });
}

describe("Agent analytics performance baseline", () => {
  it("在 10,000 个事件下保持可交互级聚合耗时", () => {
    const events = fixtureEvents(10_000);
    const insightsStart = performance.now();
    const insights = buildAgentInsights(events);
    const insightsMs = performance.now() - insightsStart;

    const flowStart = performance.now();
    const flow = buildExecutionFlow(events);
    const flowMs = performance.now() - flowStart;

    expect(insights.totalEvents).toBe(10_000);
    expect(flow.phases.length).toBe(250);
    expect(insightsMs).toBeLessThan(1_500);
    expect(flowMs).toBeLessThan(1_500);
  });
});
