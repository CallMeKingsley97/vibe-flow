import type { CaptureSession } from "../../../shared/contracts/capture";
import {
  formatReasoningEffort,
  formatTokenCount,
  tokenUsageTitle,
} from "../model/formatSessionUsage";

export function SessionUsageSummary({
  session,
  compact = false,
}: {
  session: CaptureSession;
  compact?: boolean;
}) {
  return (
    <div className={`session-usage-summary ${compact ? "compact" : ""}`}>
      <span className="session-model" title={session.model ?? "Agent 历史未提供模型名称"}>
        <i>模型</i>
        <b>{session.model ?? "未知"}</b>
      </span>
      {!compact && session.baseUrl ? (
        <span className="session-base-url" title={session.baseUrl}>
          <i>提供商</i>
          <b>{session.baseUrl}</b>
        </span>
      ) : null}
      <span title={session.reasoningEffort ?? "Agent 历史未提供思考强度"}>
        <i>思考</i>
        <b>{formatReasoningEffort(session.reasoningEffort)}</b>
      </span>
      <span title={tokenUsageTitle(session)}>
        <i>Token</i>
        <b>{formatTokenCount(session.totalTokens)}</b>
      </span>
    </div>
  );
}
