import { describe, expect, it } from "vitest";

import { formatReasoningEffort, formatTokenCount } from "./formatSessionUsage";

describe("会话模型用量格式化", () => {
  it("紧凑展示 Token 并翻译标准思考强度", () => {
    expect(formatTokenCount(null)).toBe("—");
    expect(formatTokenCount(999)).toBe("999");
    expect(formatTokenCount(1_946)).toBe("1.9K");
    expect(formatTokenCount(1_250_000)).toBe("1.3M");
    expect(formatReasoningEffort("high")).toBe("高");
    expect(formatReasoningEffort("custom")).toBe("custom");
  });
});
