import { describe, expect, it } from "vitest";

import type { AgentEvent } from "../../../shared/contracts/capture";
import {
  analyzeAgentCommands,
  analyzeCommandRisk,
  commandSignatures,
} from "./analyzeAgentCommands";

function commandEvent(commands: string[]): AgentEvent {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    sessionId: "00000000-0000-4000-8000-000000000999",
    sequence: 1,
    timestamp: "2026-07-15T00:00:00Z",
    source: "tool",
    kind: "tool_call",
    level: "info",
    summary: "执行终端命令",
    payload: { toolCategory: "command", commands },
  };
}

describe("agent command analysis", () => {
  it("extracts multiple commands and normalizes command families", () => {
    const commands = analyzeAgentCommands([
      commandEvent(["git status --short && cargo test", "pnpm build"]),
    ]);
    expect(commands).toHaveLength(2);
    expect(commandSignatures(commands[0]!.command)).toEqual(["git status", "cargo test"]);
  });

  it("classifies destructive and external write operations", () => {
    expect(analyzeCommandRisk("rm -rf ./dist").level).toBe("high");
    expect(analyzeCommandRisk("git push --force origin main").level).toBe("high");
    expect(analyzeCommandRisk("sudo chmod 777 file").level).toBe("caution");
    expect(analyzeCommandRisk("cargo test").level).toBe("none");
  });
});
