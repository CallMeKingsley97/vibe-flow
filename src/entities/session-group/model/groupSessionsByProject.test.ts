import { describe, expect, it } from "vitest";

import type { CaptureSession } from "../../../shared/contracts/capture";
import {
  formatRelativeTime,
  groupSessionsByProject,
  projectDisplayName,
  projectKey,
  UNASSIGNED_PROJECT_KEY,
} from "./groupSessionsByProject";

function session(
  id: string,
  workspace: string | null,
  updatedAt: string,
  overrides: Partial<CaptureSession> = {},
): CaptureSession {
  return {
    id,
    name: `会话 ${id}`,
    status: "stopped",
    startedAt: updatedAt,
    endedAt: updatedAt,
    lastSequence: 1,
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
    updatedAt,
    ...overrides,
  };
}

describe("groupSessionsByProject", () => {
  it("groups sessions by workspace and derives the project name", () => {
    const groups = groupSessionsByProject([
      session("1", "/Users/me/code/vibe-flow", "2026-10-20T10:00:00Z"),
      session("2", "/Users/me/code/vibe-flow/", "2026-10-20T11:00:00Z"),
      session("3", "/Users/me/code/magpie", "2026-10-20T09:00:00Z"),
    ]);

    expect(groups.map((group) => group.name)).toEqual(["vibe-flow", "magpie"]);
    expect(groups[0]?.sessionCount).toBe(2);
    expect(groups[0]?.sessions.map((item) => item.id)).toEqual(["2", "1"]);
  });

  it("orders projects by most recent activity and keeps unassigned last", () => {
    const groups = groupSessionsByProject([
      session("1", "/code/older", "2026-10-18T10:00:00Z"),
      session("2", "/code/newer", "2026-10-20T10:00:00Z"),
      session("3", null, "2026-10-21T10:00:00Z"),
    ]);

    expect(groups.map((group) => group.name)).toEqual(["newer", "older", "未关联项目"]);
    expect(groups[2]?.key).toBe(UNASSIGNED_PROJECT_KEY);
  });

  it("respects the session sort direction inside each project", () => {
    const sessions = [
      session("1", "/code/app", "2026-10-18T10:00:00Z"),
      session("2", "/code/app", "2026-10-20T10:00:00Z"),
    ];

    expect(groupSessionsByProject(sessions, "asc")[0]?.sessions.map((item) => item.id)).toEqual([
      "1",
      "2",
    ]);
    expect(groupSessionsByProject(sessions, "desc")[0]?.sessions.map((item) => item.id)).toEqual([
      "2",
      "1",
    ]);
  });

  it("flips project order with the sort direction but keeps unassigned last", () => {
    const sessions = [
      session("1", "/code/older", "2026-10-18T10:00:00Z"),
      session("2", "/code/newer", "2026-10-20T10:00:00Z"),
      session("3", null, "2026-10-21T10:00:00Z"),
    ];

    expect(groupSessionsByProject(sessions, "asc").map((group) => group.name)).toEqual([
      "older",
      "newer",
      "未关联项目",
    ]);
    expect(groupSessionsByProject(sessions, "desc").map((group) => group.name)).toEqual([
      "newer",
      "older",
      "未关联项目",
    ]);
  });

  it("disambiguates projects that share a leaf folder name", () => {
    const groups = groupSessionsByProject([
      session("1", "/Users/me/work/vibe-flow", "2026-10-20T10:00:00Z"),
      session("2", "/Users/me/oss/vibe-flow", "2026-10-20T11:00:00Z"),
      session("3", "/Users/me/code/magpie", "2026-10-20T09:00:00Z"),
    ]);

    expect(groups.find((group) => group.workspace === "/Users/me/work/vibe-flow")?.name).toBe(
      "work/vibe-flow",
    );
    expect(groups.find((group) => group.workspace === "/Users/me/oss/vibe-flow")?.name).toBe(
      "oss/vibe-flow",
    );
    expect(groups.find((group) => group.workspace === "/Users/me/code/magpie")?.name).toBe(
      "magpie",
    );
  });

  it("summarizes sources and favorites for the project header", () => {
    const groups = groupSessionsByProject([
      session("1", "/code/app", "2026-10-20T10:00:00Z", {
        source: "codex",
        isFavorite: true,
      }),
      session("2", "/code/app", "2026-10-20T11:00:00Z", { source: "claude" }),
      session("3", "/code/app", "2026-10-20T12:00:00Z", {
        source: "codex",
        isFavorite: true,
      }),
    ]);

    expect(groups[0]?.sources).toEqual([
      { source: "codex", count: 2 },
      { source: "claude", count: 1 },
    ]);
    expect(groups[0]?.favoriteCount).toBe(2);
    expect(groups[0]?.lastUpdatedAt).toBe("2026-10-20T12:00:00.000Z");
  });
});

describe("project labels and keys", () => {
  it("handles POSIX, Windows and root paths", () => {
    expect(projectDisplayName("/Users/me/code/vibe-flow/")).toBe("vibe-flow");
    expect(projectDisplayName("C:\\Users\\me\\code\\vibe-flow")).toBe("vibe-flow");
    expect(projectDisplayName("/")).toBe("/");
    expect(projectDisplayName(null)).toBe("未关联项目");
  });

  it("maps trimmed workspaces to stable keys", () => {
    expect(projectKey(" /Users/me/code/app/// ")).toBe("/Users/me/code/app");
    expect(projectKey("")).toBe(UNASSIGNED_PROJECT_KEY);
    expect(projectKey(null)).toBe(UNASSIGNED_PROJECT_KEY);
  });
});

describe("formatRelativeTime", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");

  it("formats recent activity compactly", () => {
    expect(formatRelativeTime("2026-10-20T11:59:40Z", now)).toBe("刚刚");
    expect(formatRelativeTime("2026-10-20T11:35:00Z", now)).toBe("25 分钟前");
    expect(formatRelativeTime("2026-10-20T09:00:00Z", now)).toBe("3 小时前");
    expect(formatRelativeTime("2026-10-19T10:00:00Z", now)).toBe("昨天");
    expect(formatRelativeTime("2026-10-16T10:00:00Z", now)).toBe("4 天前");
    expect(formatRelativeTime("2026-09-01T10:00:00Z", now)).toBe("09/01");
  });
});
