import type { CaptureSession } from "../../../shared/contracts/capture";

export function formatTokenCount(value: number | null): string {
  if (value === null) return "—";
  if (value < 1_000) return value.toLocaleString("zh-CN");
  if (value < 1_000_000) return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}K`;
  return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0)}M`;
}

export function formatReasoningEffort(value: string | null): string {
  if (!value) return "未记录";
  const labels: Record<string, string> = {
    minimal: "最低",
    low: "低",
    medium: "中",
    high: "高",
    xhigh: "极高",
    max: "最高",
    none: "关闭",
    enabled: "已启用",
  };
  return labels[value.toLowerCase()] ?? value;
}

export function tokenUsageTitle(session: CaptureSession): string {
  const values = [
    ["输入", session.inputTokens],
    ["缓存", session.cachedInputTokens],
    ["输出", session.outputTokens],
    ["推理", session.reasoningOutputTokens],
  ] as const;
  const details = values
    .filter(([, value]) => value !== null)
    .map(([label, value]) => `${label} ${value?.toLocaleString("zh-CN")}`);
  return details.length ? details.join(" · ") : "Agent 历史未提供 Token 用量";
}
