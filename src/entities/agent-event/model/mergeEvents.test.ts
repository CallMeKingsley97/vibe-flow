import { describe, expect, it } from "vitest";

import type { AgentEvent } from "../../../shared/contracts/capture";
import { mergeEvents } from "./mergeEvents";

function event(sequence: number, summary: string): AgentEvent {
  return {
    id: `event-${sequence}`,
    sessionId: "session-1",
    sequence,
    timestamp: "2026-07-15T00:00:00Z",
    source: "system",
    kind: "message",
    level: "info",
    summary,
    payload: {},
  };
}

describe("mergeEvents", () => {
  it("按 sequence 排序并用实时事件覆盖重复历史事件", () => {
    const result = mergeEvents([event(2, "old"), event(1, "first")], [event(2, "new")]);

    expect(result.map((item) => item.sequence)).toEqual([1, 2]);
    expect(result[1]?.summary).toBe("new");
  });

  it("可以稳定合并 5,000 条乱序事件", () => {
    const incoming = Array.from({ length: 5_000 }, (_, index) => event(5_000 - index, "line"));
    const result = mergeEvents([], incoming);

    expect(result).toHaveLength(5_000);
    expect(result[0]?.sequence).toBe(1);
    expect(result.at(-1)?.sequence).toBe(5_000);
  });
});
