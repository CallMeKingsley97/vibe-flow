// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CaptureSession } from "../../shared/contracts/capture";
import { groupSessionsByProject } from "../../entities/session-group/model/groupSessionsByProject";
import { ProjectSessionTree } from "./ProjectSessionTree";

function session(
  id: string,
  workspace: string | null,
  overrides: Partial<CaptureSession> = {},
): CaptureSession {
  return {
    id,
    name: `会话 ${id}`,
    status: "stopped",
    startedAt: "2026-10-20T10:00:00Z",
    endedAt: "2026-10-20T11:00:00Z",
    lastSequence: 3,
    source: "claude",
    externalId: null,
    sourcePath: null,
    workspace,
    model: "claude-sonnet",
    baseUrl: null,
    reasoningEffort: null,
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
    reasoningOutputTokens: null,
    totalTokens: 1000,
    isFavorite: false,
    updatedAt: "2026-10-20T11:00:00Z",
    ...overrides,
  };
}

const sessions = [
  session("1", "/Users/me/code/vibe-flow", { source: "codex" }),
  session("2", "/Users/me/code/vibe-flow", { name: "修复发布脚本" }),
  session("3", null, { name: "未关联会话" }),
];

function renderTree(overrides: Partial<Parameters<typeof ProjectSessionTree>[0]> = {}) {
  const handlers = {
    onSelectSession: vi.fn(),
    onToggleProject: vi.fn(),
    onToggleFavorite: vi.fn(),
    onFilterProject: vi.fn(),
  };
  render(
    <ProjectSessionTree
      activeWorkspace={null}
      collapsed={new Set()}
      groups={groupSessionsByProject(sessions)}
      selectedId={null}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe("ProjectSessionTree", () => {
  // Testing Library only auto-cleans when globals are enabled; this project
  // imports the API explicitly, so reset the DOM between cases.
  afterEach(cleanup);

  it("按项目分组渲染，并标出项目内的来源", () => {
    renderTree();

    expect(screen.getAllByText("vibe-flow")).toHaveLength(1);
    expect(screen.getByText("未关联项目")).toBeTruthy();
    expect(screen.getByText("未关联会话")).toBeTruthy();
    // 项目内混合来源时，每条会话带来源徽标
    expect(screen.getByText("Codex")).toBeTruthy();
    expect(screen.getByText("Claude")).toBeTruthy();
  });

  it("收起项目后隐藏其会话，但保留项目头", () => {
    renderTree({ collapsed: new Set(["/Users/me/code/vibe-flow"]) });

    expect(screen.getByText("vibe-flow")).toBeTruthy();
    expect(screen.queryByText("修复发布脚本")).toBeNull();
    expect(screen.getByText("未关联会话")).toBeTruthy();
  });

  it("点击项目头切换展开状态，点击会话选中", () => {
    const handlers = renderTree();

    fireEvent.click(screen.getByRole("button", { name: /vibe-flow/ }));
    expect(handlers.onToggleProject).toHaveBeenCalledWith("/Users/me/code/vibe-flow");

    fireEvent.click(screen.getByText("修复发布脚本"));
    expect(handlers.onSelectSession).toHaveBeenCalledWith("2");
  });

  it("只有记录了工作目录的项目才提供“只看此项目”", () => {
    const handlers = renderTree();

    const filterButtons = screen.getAllByRole("button", { name: "只看此项目" });
    expect(filterButtons).toHaveLength(1);
    fireEvent.click(filterButtons[0]!);
    expect(handlers.onFilterProject).toHaveBeenCalledWith("/Users/me/code/vibe-flow");
  });

  it("筛选中的项目显示为激活态并可清除", () => {
    renderTree({ activeWorkspace: "/Users/me/code/vibe-flow/" });

    const clear = screen.getByRole("button", { name: "清除项目筛选" });
    expect(clear.getAttribute("aria-pressed")).toBe("true");
  });

  it("收藏按钮独立于会话选择触发", () => {
    const handlers = renderTree();

    fireEvent.click(screen.getAllByRole("button", { name: "收藏" })[0]!);
    expect(handlers.onToggleFavorite).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }));
    expect(handlers.onSelectSession).not.toHaveBeenCalled();
  });
});
