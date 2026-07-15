import type { AgentEvent } from "../../../shared/contracts/capture";
import {
  analyzeAgentCommands,
  analyzeRiskOperations,
  type CommandObservation,
  type RiskObservation,
} from "../../agent-command/model/analyzeAgentCommands";
import { buildExecutionFlow } from "../../execution-flow/model/buildExecutionFlow";

export interface RankedAgentItem {
  name: string;
  count: number;
}

export interface AgentInsights {
  durationMs: number;
  totalEvents: number;
  userMessages: number;
  agentMessages: number;
  reasoningEvents: number;
  toolCalls: number;
  skills: number;
  mcpCalls: number;
  commands: number;
  fileChanges: number;
  errors: number;
  riskyOperations: number;
  phases: number;
  topTools: RankedAgentItem[];
  topCommands: RankedAgentItem[];
  topSkills: RankedAgentItem[];
  topMcpServers: RankedAgentItem[];
  eventKinds: RankedAgentItem[];
  commandObservations: CommandObservation[];
  riskOperations: RiskObservation[];
}

function stringPayload(event: AgentEvent, key: string) {
  const value = event.payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function rank(values: string[], limit = 8): RankedAgentItem[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, limit);
}

export function buildAgentInsights(events: AgentEvent[]): AgentInsights {
  const flow = buildExecutionFlow(events);
  const commandObservations = analyzeAgentCommands(events);
  const riskOperations = analyzeRiskOperations(events);
  const first = events[0];
  const last = events.at(-1);
  const toolEvents = events.filter(
    (event) => event.kind === "tool_call" && stringPayload(event, "toolCategory") !== "wait",
  );

  return {
    durationMs:
      first && last ? Math.max(0, Date.parse(last.timestamp) - Date.parse(first.timestamp)) : 0,
    totalEvents: events.length,
    userMessages: events.filter((event) => event.kind === "message" && event.source === "user")
      .length,
    agentMessages: events.filter((event) => event.kind === "message" && event.source === "agent")
      .length,
    reasoningEvents: events.filter((event) => event.kind === "reasoning").length,
    toolCalls: toolEvents.length,
    skills: flow.metrics.skills,
    mcpCalls: flow.metrics.mcpCalls,
    commands: commandObservations.length,
    fileChanges: flow.metrics.fileChanges,
    errors: events.filter((event) => event.level === "error" || event.payload.failed === true)
      .length,
    riskyOperations: riskOperations.filter(
      (item) => item.riskLevel === "high" || item.riskLevel === "critical",
    ).length,
    phases: flow.phases.length,
    topTools: rank(
      toolEvents
        .filter((event) => !["skill", "mcp"].includes(stringPayload(event, "toolCategory") ?? ""))
        .map((event) => stringPayload(event, "toolName") ?? "未知工具"),
    ),
    topCommands: rank(
      commandObservations.flatMap((item) => item.signatures),
      12,
    ),
    topSkills: rank(
      toolEvents
        .map((event) => stringPayload(event, "skillName"))
        .filter((value): value is string => Boolean(value)),
    ),
    topMcpServers: rank(
      toolEvents
        .map((event) => stringPayload(event, "mcpServer"))
        .filter((value): value is string => Boolean(value)),
    ),
    eventKinds: rank(
      events.map((event) => event.kind),
      10,
    ),
    commandObservations,
    riskOperations,
  };
}
