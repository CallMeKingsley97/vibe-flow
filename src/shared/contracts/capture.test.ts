import { describe, expect, it } from "vitest";

import { CaptureSessionSchema } from "./capture";

const validSession = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  name: "本地会话",
  status: "stopped",
  startedAt: "2026-07-17T08:00:00Z",
  endedAt: null,
  lastSequence: 0,
  source: "codex",
  externalId: null,
  sourcePath: null,
  workspace: null,
  model: null,
  reasoningEffort: null,
  inputTokens: null,
  cachedInputTokens: null,
  outputTokens: null,
  reasoningOutputTokens: null,
  totalTokens: null,
  updatedAt: "2026-07-17T08:00:00Z",
} as const;

describe("CaptureSessionSchema", () => {
  it("接受包含代理对的 80 个 Unicode 字符名称", () => {
    const name = `${"a".repeat(78)}😀😀`;

    expect(name.length).toBe(82);
    expect(Array.from(name)).toHaveLength(80);
    expect(CaptureSessionSchema.safeParse({ ...validSession, name }).success).toBe(true);
  });

  it("拒绝超过 80 个 Unicode 字符的名称", () => {
    const name = `${"a".repeat(79)}😀😀`;

    expect(Array.from(name)).toHaveLength(81);
    expect(CaptureSessionSchema.safeParse({ ...validSession, name }).success).toBe(false);
  });
});
