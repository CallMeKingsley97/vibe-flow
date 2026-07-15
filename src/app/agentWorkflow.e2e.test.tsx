// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AgentEvent } from "../shared/contracts/capture";
import { AgentInsights } from "../widgets/agent-insights/AgentInsights";
import { ExecutionFlow } from "../widgets/execution-flow/ExecutionFlow";

function event(
  sequence: number,
  source: AgentEvent["source"],
  kind: AgentEvent["kind"],
  summary: string,
  payload: Record<string, unknown> = {},
): AgentEvent {
  return {
    id: `00000000-0000-4000-8000-${sequence.toString().padStart(12, "0")}`,
    sessionId: "00000000-0000-4000-8000-000000000001",
    sequence,
    timestamp: new Date(Date.UTC(2026, 6, 15, 0, 0, sequence)).toISOString(),
    source,
    kind,
    level: "info",
    summary,
    payload,
  };
}

const events = [
  event(1, "user", "message", "完成发布准备"),
  event(2, "agent", "message", "开始检查项目"),
  event(3, "tool", "tool_call", "执行终端命令", {
    toolName: "exec",
    toolCategory: "command",
    command: "git reset --hard HEAD~1",
    commands: ["git reset --hard HEAD~1"],
  }),
  event(4, "tool", "file_change", "更新 release.yml"),
];

describe("Agent 关键查看路径", () => {
  it("从统计风险入口定位事件，并能在高危流程中再次定位", () => {
    const selectFromInsights = vi.fn();
    const { unmount } = render(
      <AgentInsights events={events} loading={false} onSelectEvent={selectFromInsights} />,
    );

    expect(screen.getByText("会话执行概览")).toBeTruthy();
    expect(screen.getByText("高危与需注意操作")).toBeTruthy();
    const riskButton = screen.getAllByText("git reset --hard HEAD~1")[0]?.closest("button");
    if (!riskButton) throw new Error("风险入口按钮不存在");
    fireEvent.click(riskButton);
    expect(selectFromInsights).toHaveBeenCalledWith(events[2]!.id);

    unmount();
    const selectFromFlow = vi.fn();
    render(<ExecutionFlow events={events} initialView="risk" onSelectEvent={selectFromFlow} />);
    expect(screen.getByRole("tab", { name: "只看高危" }).className).toContain("active");
    fireEvent.click(screen.getByTitle("git reset --hard HEAD~1"));
    expect(selectFromFlow).toHaveBeenCalledWith(events[2]!.id);
  });
});
