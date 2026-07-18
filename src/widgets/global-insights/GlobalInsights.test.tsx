// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GlobalInsights } from "../../shared/contracts/capture";
import { GlobalInsightsView } from "./GlobalInsights";

function sampleInsights(): GlobalInsights {
  return {
    from: "2026-06-18T00:00:00.000Z",
    to: "2026-07-18T00:00:00.000Z",
    totals: {
      sessions: 12,
      events: 240,
      userMessages: 40,
      agentMessages: 50,
      toolCalls: 80,
      commands: 20,
      fileChanges: 10,
      errors: 3,
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
    },
    bySource: [
      {
        source: "claude",
        sessions: 8,
        events: 160,
        toolCalls: 50,
        commands: 12,
        errors: 2,
        totalTokens: 900,
      },
      {
        source: "codex",
        sessions: 4,
        events: 80,
        toolCalls: 30,
        commands: 8,
        errors: 1,
        totalTokens: 600,
      },
    ],
    byProject: [
      {
        workspace: "/Users/demo/project-a",
        sessions: 7,
        events: 140,
        errors: 1,
        totalTokens: 800,
        lastActiveAt: "2026-07-17T10:00:00.000Z",
      },
    ],
    timeline: [
      { bucket: "2026-07-16", sessions: 3, events: 40, errors: 0 },
      { bucket: "2026-07-17", sessions: 5, events: 70, errors: 1 },
    ],
    topTools: [{ name: "Bash", count: 20 }],
    topSkills: [{ name: "code-review", count: 3 }],
    topMcp: [{ name: "chrome-devtools", count: 2 }],
  };
}

describe("GlobalInsightsView", () => {
  it("渲染对比条与排行，并响应时间范围切换", () => {
    const onRangeChange = vi.fn();
    const onBucketChange = vi.fn();
    const onSourceChange = vi.fn();
    const onProjectClick = vi.fn();
    const onRefresh = vi.fn();

    render(
      <GlobalInsightsView
        bucket="day"
        data={sampleInsights()}
        error={null}
        loading={false}
        onBucketChange={onBucketChange}
        onProjectClick={onProjectClick}
        onRangeChange={onRangeChange}
        onRefresh={onRefresh}
        onSourceChange={onSourceChange}
        range="30d"
        source="all"
        workspace={null}
      />,
    );

    expect(screen.getByText("跨 Agent 洞察")).toBeTruthy();
    expect(screen.getAllByText("Claude").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Codex").length).toBeGreaterThan(0);
    expect(screen.getByText("/Users/demo/project-a")).toBeTruthy();
    expect(screen.getByText("Bash")).toBeTruthy();
    expect(screen.getByText("code-review")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "最近 7 天" }));
    expect(onRangeChange).toHaveBeenCalledWith("7d");

    fireEvent.click(screen.getByRole("tab", { name: "按周" }));
    expect(onBucketChange).toHaveBeenCalledWith("week");

    fireEvent.click(screen.getByRole("tab", { name: "Claude" }));
    expect(onSourceChange).toHaveBeenCalledWith("claude");

    fireEvent.click(screen.getByRole("button", { name: /project-a/i }));
    expect(onProjectClick).toHaveBeenCalledWith("/Users/demo/project-a");

    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    expect(onRefresh).toHaveBeenCalled();
  });

  it("在空数据时展示引导", () => {
    const empty = sampleInsights();
    empty.totals.sessions = 0;
    empty.totals.events = 0;
    empty.bySource = [];
    empty.byProject = [];
    empty.timeline = [];
    empty.topTools = [];
    empty.topSkills = [];
    empty.topMcp = [];

    render(
      <GlobalInsightsView
        bucket="day"
        data={empty}
        error={null}
        loading={false}
        onBucketChange={() => undefined}
        onRangeChange={() => undefined}
        onRefresh={() => undefined}
        onSourceChange={() => undefined}
        range="30d"
        source="all"
        workspace={null}
      />,
    );

    expect(screen.getByText("还没有可以聚合的数据")).toBeTruthy();
    expect(screen.getAllByRole("tab", { name: "全部" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("tab", { name: "Gemini" }).length).toBeGreaterThan(0);
  });

  it("筛选到无数据的 Agent 时保留筛选控件并可返回全部", () => {
    const empty = sampleInsights();
    empty.totals.sessions = 0;
    empty.totals.events = 0;
    empty.bySource = [];
    empty.byProject = [];
    empty.timeline = [];
    empty.topTools = [];
    empty.topSkills = [];
    empty.topMcp = [];
    const onSourceChange = vi.fn();

    render(
      <GlobalInsightsView
        bucket="day"
        data={empty}
        error={null}
        loading={false}
        onBucketChange={() => undefined}
        onRangeChange={() => undefined}
        onRefresh={() => undefined}
        onSourceChange={onSourceChange}
        range="30d"
        source="gemini"
        workspace={null}
      />,
    );

    expect(screen.getByText(/当前筛选「Gemini」/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "返回全部 Agent" }));
    expect(onSourceChange).toHaveBeenCalledWith("all");
  });

  it("在错误态展示错误信息", () => {
    render(
      <GlobalInsightsView
        bucket="day"
        data={null}
        error="后端不可用"
        loading={false}
        onBucketChange={() => undefined}
        onRangeChange={() => undefined}
        onRefresh={() => undefined}
        onSourceChange={() => undefined}
        range="30d"
        source="all"
        workspace={null}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("后端不可用");
  });
});
