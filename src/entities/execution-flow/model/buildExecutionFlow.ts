import type { AgentEvent } from "../../../shared/contracts/capture";
import {
  analyzeEventRisk,
  commandSignatures,
  type RiskLevel,
} from "../../agent-command/model/analyzeAgentCommands";

export type FlowNodeKind =
  | "progress"
  | "reasoning"
  | "skill"
  | "mcp"
  | "file"
  | "command"
  | "plan"
  | "interaction"
  | "tool"
  | "error"
  | "result";

export interface ExecutionFlowNode {
  id: string;
  eventId: string;
  kind: FlowNodeKind;
  label: string;
  detail: string | null;
  count: number;
  startedAt: string;
  completedAt: string;
  startSequence: number;
  endSequence: number;
  riskLevel: RiskLevel;
  riskReason: string | null;
}

export interface ExecutionFlowPhase {
  id: string;
  title: string;
  startedAt: string;
  startSequence: number;
  endSequence: number;
  nodes: ExecutionFlowNode[];
}

export interface ExecutionFlow {
  phases: ExecutionFlowPhase[];
  metrics: {
    skills: number;
    mcpCalls: number;
    toolCalls: number;
    fileChanges: number;
    errors: number;
    commands: number;
    riskyOperations: number;
  };
}

function stringPayload(event: AgentEvent, key: string) {
  const value = event.payload[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function booleanPayload(event: AgentEvent, key: string) {
  return event.payload[key] === true;
}

function commandsFromEvent(event: AgentEvent) {
  const commands = event.payload.commands;
  if (Array.isArray(commands)) {
    return commands.filter(
      (value): value is string => typeof value === "string" && Boolean(value.trim()),
    );
  }
  const command = stringPayload(event, "command");
  return command ? [command] : [];
}

function compact(value: string, limit = 88) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
}

function skillFromText(value: string) {
  const match = value.match(
    /(?:使用|读取|use|using)\s*[`"']?([a-z0-9][\w.-]{1,50})[`"']?\s*(?:skill|技能)/i,
  );
  return match?.[1] ?? null;
}

function classify(
  event: AgentEvent,
): Omit<
  ExecutionFlowNode,
  "id" | "eventId" | "count" | "startedAt" | "completedAt" | "startSequence" | "endSequence"
> | null {
  const risk = analyzeEventRisk(event);
  const riskFields = { riskLevel: risk.level, riskReason: risk.reason };
  if (event.level === "error" || booleanPayload(event, "failed")) {
    return { kind: "error", label: "发生错误", detail: compact(event.summary, 140), ...riskFields };
  }
  if (event.kind === "reasoning") {
    return {
      kind: "reasoning",
      label: "Reasoning 摘要",
      detail: compact(event.summary, 140),
      ...riskFields,
    };
  }
  if (event.kind === "file_change") {
    return { kind: "file", label: "修改文件", detail: compact(event.summary, 140), ...riskFields };
  }
  if (event.kind === "command") {
    const command = commandsFromEvent(event)[0] ?? event.summary;
    return {
      kind: "command",
      label: `执行命令 · ${commandSignatures(command)[0] ?? "shell"}`,
      detail: compact(command, 180),
      ...riskFields,
    };
  }
  if (event.kind === "tool_result") return null;
  if (event.kind === "tool_call") {
    const toolName = stringPayload(event, "toolName") ?? "tool";
    const category = stringPayload(event, "toolCategory");
    const operation = stringPayload(event, "operation");
    const skillName = stringPayload(event, "skillName");
    const mcpServer = stringPayload(event, "mcpServer");
    if (category === "wait") return null;
    if (skillName || category === "skill") {
      return {
        kind: "skill",
        label: `使用 Skill · ${skillName ?? toolName}`,
        detail: operation,
        ...riskFields,
      };
    }
    if (mcpServer || category === "mcp" || toolName.startsWith("mcp__")) {
      return {
        kind: "mcp",
        label: `调用 MCP · ${mcpServer ?? toolName}`,
        detail: operation,
        ...riskFields,
      };
    }
    const kind: FlowNodeKind =
      category === "file"
        ? "file"
        : category === "command"
          ? "command"
          : category === "plan"
            ? "plan"
            : category === "interaction"
              ? "interaction"
              : "tool";
    if (kind === "command") {
      const commands = commandsFromEvent(event);
      const command = commands[0];
      return {
        kind,
        label: command
          ? `执行命令 · ${commandSignatures(command)[0] ?? toolName}`
          : (operation ?? `调用工具 · ${toolName}`),
        detail: command
          ? compact(
              commands.length > 1 ? `${command}（另有 ${commands.length - 1} 条）` : command,
              180,
            )
          : toolName,
        ...riskFields,
      };
    }
    return { kind, label: operation ?? `调用工具 · ${toolName}`, detail: toolName, ...riskFields };
  }
  if (event.kind === "message" && event.source === "agent") {
    const skillName = skillFromText(event.summary);
    if (skillName)
      return {
        kind: "skill",
        label: `使用 Skill · ${skillName}`,
        detail: compact(event.summary, 140),
        ...riskFields,
      };
    return {
      kind: "progress",
      label: "关键进展",
      detail: compact(event.summary, 140),
      ...riskFields,
    };
  }
  if (event.kind === "llm_usage") {
    return {
      kind: "result",
      label: "模型用量",
      detail: compact(event.summary, 140),
      ...riskFields,
    };
  }
  return null;
}

function appendNode(phase: ExecutionFlowPhase, event: AgentEvent) {
  const classified = classify(event);
  if (!classified) return;
  const previous = phase.nodes.at(-1);
  if (
    previous &&
    previous.kind === classified.kind &&
    previous.label === classified.label &&
    previous.riskLevel === classified.riskLevel &&
    event.sequence - previous.endSequence <= 3
  ) {
    previous.count += 1;
    previous.completedAt = event.timestamp;
    previous.endSequence = event.sequence;
    previous.eventId = event.id;
    return;
  }
  phase.nodes.push({
    id: `${phase.id}-${event.id}`,
    eventId: event.id,
    ...classified,
    count: 1,
    startedAt: event.timestamp,
    completedAt: event.timestamp,
    startSequence: event.sequence,
    endSequence: event.sequence,
  });
}

export function buildExecutionFlow(events: AgentEvent[]): ExecutionFlow {
  const phases: ExecutionFlowPhase[] = [];
  let phase: ExecutionFlowPhase | null = null;
  for (const event of events) {
    if (event.kind === "message" && event.source === "user") {
      phase = {
        id: event.id,
        title: compact(event.summary, 110),
        startedAt: event.timestamp,
        startSequence: event.sequence,
        endSequence: event.sequence,
        nodes: [],
      };
      phases.push(phase);
      continue;
    }
    if (!phase) {
      phase = {
        id: `initial-${event.id}`,
        title: "会话初始化",
        startedAt: event.timestamp,
        startSequence: event.sequence,
        endSequence: event.sequence,
        nodes: [],
      };
      phases.push(phase);
    }
    phase.endSequence = event.sequence;
    appendNode(phase, event);
  }

  const nodes = phases.flatMap((item) => item.nodes);
  return {
    phases,
    metrics: {
      skills: nodes
        .filter((node) => node.kind === "skill")
        .reduce((sum, node) => sum + node.count, 0),
      mcpCalls: nodes
        .filter((node) => node.kind === "mcp")
        .reduce((sum, node) => sum + node.count, 0),
      toolCalls: nodes
        .filter((node) => ["tool", "command", "file", "plan", "interaction"].includes(node.kind))
        .reduce((sum, node) => sum + node.count, 0),
      fileChanges: nodes
        .filter((node) => node.kind === "file")
        .reduce((sum, node) => sum + node.count, 0),
      errors: nodes
        .filter((node) => node.kind === "error")
        .reduce((sum, node) => sum + node.count, 0),
      commands: nodes
        .filter((node) => node.kind === "command")
        .reduce((sum, node) => sum + node.count, 0),
      riskyOperations: nodes
        .filter((node) => node.riskLevel === "high" || node.riskLevel === "critical")
        .reduce((sum, node) => sum + node.count, 0),
    },
  };
}
