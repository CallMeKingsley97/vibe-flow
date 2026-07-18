import { describe, expect, it } from "vitest";

import {
  formatBucketLabel,
  formatCount,
  isEmpty,
  maxBucketValue,
  rangeWindow,
} from "./formatInsights";
import type { GlobalInsights } from "../../../shared/contracts/capture";

function emptyInsights(overrides: Partial<GlobalInsights> = {}): GlobalInsights {
  return {
    from: "2026-01-01T00:00:00.000Z",
    to: "2026-01-31T00:00:00.000Z",
    totals: {
      sessions: 0,
      events: 0,
      userMessages: 0,
      agentMessages: 0,
      toolCalls: 0,
      commands: 0,
      fileChanges: 0,
      errors: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
    bySource: [],
    byProvider: [],
    byProject: [],
    timeline: [],
    topTools: [],
    topSkills: [],
    topMcp: [],
    ...overrides,
  };
}

describe("formatInsights", () => {
  it("把 range 换算成 UTC 时间窗", () => {
    const now = new Date("2026-07-18T12:00:00.000Z");
    const week = rangeWindow("7d", now);
    const month = rangeWindow("30d", now);
    const quarter = rangeWindow("90d", now);

    expect(week.to).toBe(now.toISOString());
    expect(new Date(week.from).toISOString()).toBe("2026-07-11T12:00:00.000Z");
    expect(new Date(month.from).toISOString()).toBe("2026-06-18T12:00:00.000Z");
    expect(new Date(quarter.from).toISOString()).toBe("2026-04-19T12:00:00.000Z");
  });

  it("格式化日/周桶标签", () => {
    expect(formatBucketLabel("2026-07-18")).toBe("07/18");
    expect(formatBucketLabel("2026-W28")).toBe("第 28 周");
    expect(formatBucketLabel("raw")).toBe("raw");
  });

  it("压缩大数字显示", () => {
    expect(formatCount(42)).toBe("42");
    expect(formatCount(1500)).toBe("1.5K");
    expect(formatCount(12500)).toBe("13K");
    expect(formatCount(2_500_000)).toBe("2.5M");
  });

  it("识别空洞察", () => {
    expect(isEmpty(emptyInsights())).toBe(true);
    expect(
      isEmpty(
        emptyInsights({
          totals: {
            ...emptyInsights().totals,
            sessions: 1,
          },
        }),
      ),
    ).toBe(false);
  });

  it("计算时间桶最大值", () => {
    const max = maxBucketValue(
      [
        { bucket: "a", sessions: 2, events: 10, errors: 0 },
        { bucket: "b", sessions: 8, events: 3, errors: 1 },
      ],
      "sessions",
    );
    expect(max).toBe(8);
  });
});
