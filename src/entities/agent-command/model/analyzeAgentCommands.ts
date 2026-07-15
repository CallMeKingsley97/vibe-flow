import type { AgentEvent } from "../../../shared/contracts/capture";

export type RiskLevel = "none" | "caution" | "high" | "critical";

export interface CommandObservation {
  id: string;
  eventId: string;
  sequence: number;
  timestamp: string;
  command: string;
  signatures: string[];
  riskLevel: RiskLevel;
  riskReason: string | null;
}

export interface RiskObservation {
  id: string;
  eventId: string;
  sequence: number;
  timestamp: string;
  title: string;
  detail: string;
  riskLevel: Exclude<RiskLevel, "none">;
  riskReason: string;
}

const separators = /(?:\r?\n|&&|\|\||;|\|)/;

function payloadCommands(event: AgentEvent): string[] {
  const isCommandEvent =
    event.kind === "command" ||
    (event.kind === "tool_call" && event.payload.toolCategory === "command");
  if (!isCommandEvent) return [];
  const commands = event.payload.commands;
  if (Array.isArray(commands)) {
    return commands.filter(
      (value): value is string => typeof value === "string" && Boolean(value.trim()),
    );
  }
  const command = event.payload.command;
  if (typeof command === "string" && command.trim()) return [command];
  if (event.kind === "command" && event.summary.trim()) return [event.summary];
  return [];
}

function stripPrefix(segment: string) {
  return segment
    .trim()
    .replace(/^(?:env\s+)?(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]+\s+)*/, "")
    .replace(/^sudo\s+/, "");
}

export function commandSignatures(command: string): string[] {
  return command
    .split(separators)
    .map(stripPrefix)
    .filter(Boolean)
    .map((segment) => {
      const tokens = segment.match(/(?:"[^"]*"|'[^']*'|\S+)/g) ?? [];
      const executable = (tokens[0] ?? "未知命令").replace(/^.*\//, "");
      if (
        ["git", "cargo", "pnpm", "npm", "yarn", "bun", "docker", "kubectl"].includes(executable)
      ) {
        const subcommand = tokens.find((token, index) => index > 0 && !token.startsWith("-"));
        return subcommand ? `${executable} ${subcommand.replaceAll(/["']/g, "")}` : executable;
      }
      return executable;
    });
}

export function analyzeCommandRisk(command: string): {
  level: RiskLevel;
  reason: string | null;
} {
  const normalized = command.toLocaleLowerCase().replace(/\s+/g, " ");
  const critical: Array<[RegExp, string]> = [
    [
      /\brm\s+-[^\n]*(?:r[^\n]*f|f[^\n]*r)[^\n]*(?:\/\s*$|\/\*|~\/|\$home)/,
      "递归强制删除系统或用户目录",
    ],
    [
      /\b(?:mkfs|diskutil\s+erase|format\s+[a-z]:|dd\s+[^\n]*of=\/dev\/)/,
      "可能格式化或覆盖磁盘设备",
    ],
    [/:\(\)\s*\{\s*:\|:&\s*\};:/, "检测到 fork bomb"],
    [/\b(?:drop\s+database|drop\s+schema)\b/, "可能删除整个数据库或 schema"],
  ];
  const high: Array<[RegExp, string]> = [
    [/\brm\s+-[^\n]*r/, "递归删除文件或目录"],
    [
      /\bgit\s+(?:reset\s+--hard|clean\s+-[^\s]*f|checkout\s+--\s+)/,
      "可能不可逆地丢弃本地代码修改",
    ],
    [/\bgit\s+push\b[^\n]*(?:--force|-f\b)/, "强制推送可能覆盖远程历史"],
    [/\b(?:drop\s+table|truncate\s+table|delete\s+from\s+\S+\s*(?:;|$))/, "可能批量删除持久化数据"],
    [/\b(?:curl|wget)\b[^\n|]*\|\s*(?:sh|bash|zsh)\b/, "从网络下载内容并直接执行"],
    [/\b(?:npm|pnpm|yarn|cargo)\s+publish\b/, "发布操作会修改外部软件仓库"],
    [
      /\b(?:kubectl\s+delete|terraform\s+destroy|docker\s+system\s+prune)\b/,
      "可能删除远程或容器基础设施",
    ],
    [/\b(?:networksetup|pfctl|iptables|ufw)\b/, "修改系统网络或防火墙配置"],
  ];
  const caution: Array<[RegExp, string]> = [
    [/\bsudo\b/, "使用管理员权限执行命令"],
    [/\bgit\s+push\b/, "向远程仓库写入内容"],
    [/\b(?:chmod|chown)\b/, "修改文件权限或所有者"],
    [/\b(?:kill|pkill|killall)\b/, "终止系统进程"],
    [/\b(?:deploy|release)\b/, "可能执行部署或发布操作"],
  ];

  for (const [pattern, reason] of critical)
    if (pattern.test(normalized)) return { level: "critical", reason };
  for (const [pattern, reason] of high)
    if (pattern.test(normalized)) return { level: "high", reason };
  for (const [pattern, reason] of caution)
    if (pattern.test(normalized)) return { level: "caution", reason };
  return { level: "none", reason: null };
}

export function analyzeEventRisk(event: AgentEvent): {
  level: RiskLevel;
  reason: string | null;
} {
  let highest: { level: RiskLevel; reason: string | null } = { level: "none", reason: null };
  const priority: Record<RiskLevel, number> = { none: 0, caution: 1, high: 2, critical: 3 };
  for (const command of payloadCommands(event)) {
    const risk = analyzeCommandRisk(command);
    if (priority[risk.level] > priority[highest.level]) highest = risk;
  }
  const operation = typeof event.payload.operation === "string" ? event.payload.operation : "";
  if (
    highest.level === "none" &&
    (event.kind === "file_change" || event.payload.toolCategory === "file") &&
    /(?:删除|移除|delete|remove|unlink)/i.test(`${event.summary} ${operation}`)
  ) {
    return { level: "high", reason: "删除项目文件" };
  }
  return highest;
}

export function analyzeAgentCommands(events: AgentEvent[]): CommandObservation[] {
  return events.flatMap((event) =>
    payloadCommands(event).map((command, index) => {
      const risk = analyzeCommandRisk(command);
      return {
        id: `${event.id}:${index}`,
        eventId: event.id,
        sequence: event.sequence,
        timestamp: event.timestamp,
        command: command.trim(),
        signatures: commandSignatures(command),
        riskLevel: risk.level,
        riskReason: risk.reason,
      };
    }),
  );
}

export function analyzeRiskOperations(events: AgentEvent[]): RiskObservation[] {
  const commandRisks: RiskObservation[] = analyzeAgentCommands(events)
    .filter((item) => item.riskLevel !== "none")
    .map((item) => ({
      id: item.id,
      eventId: item.eventId,
      sequence: item.sequence,
      timestamp: item.timestamp,
      title:
        item.riskLevel === "critical"
          ? "严重命令"
          : item.riskLevel === "high"
            ? "高危命令"
            : "需注意命令",
      detail: item.command,
      riskLevel: item.riskLevel as Exclude<RiskLevel, "none">,
      riskReason: item.riskReason ?? "命中风险规则",
    }));
  const commandEventIds = new Set(commandRisks.map((item) => item.eventId));
  const otherRisks: RiskObservation[] = events.flatMap((event) => {
    if (commandEventIds.has(event.id)) return [];
    const risk = analyzeEventRisk(event);
    if (risk.level === "none") return [];
    return [
      {
        id: event.id,
        eventId: event.id,
        sequence: event.sequence,
        timestamp: event.timestamp,
        title:
          risk.level === "critical"
            ? "严重操作"
            : risk.level === "high"
              ? "高危操作"
              : "需注意操作",
        detail: event.summary,
        riskLevel: risk.level,
        riskReason: risk.reason ?? "命中风险规则",
      },
    ];
  });
  return [...commandRisks, ...otherRisks].sort((left, right) => left.sequence - right.sequence);
}
