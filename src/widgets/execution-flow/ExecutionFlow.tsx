import { useMemo, useState } from "react";

import { analyzeEventRisk } from "../../entities/agent-command/model/analyzeAgentCommands";
import { buildExecutionFlow } from "../../entities/execution-flow/model/buildExecutionFlow";
import type { AgentEvent } from "../../shared/contracts/capture";
import { Icon } from "../../shared/ui/icons";

export type FlowView = "all" | "risk";

interface ExecutionFlowProps {
  events: AgentEvent[];
  initialView?: FlowView;
  view?: FlowView;
  onViewChange?: (view: FlowView) => void;
  onSelectEvent?: (eventId: string) => void;
}

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function ExecutionFlow({
  events,
  initialView = "all",
  view: controlledView,
  onViewChange,
  onSelectEvent,
}: ExecutionFlowProps) {
  const flow = useMemo(() => buildExecutionFlow(events), [events]);
  const [localView, setLocalView] = useState<FlowView>(initialView);
  const view = controlledView ?? localView;
  const riskEntries = useMemo(
    () =>
      events
        .map((event) => ({ event, risk: analyzeEventRisk(event) }))
        .filter(({ event, risk }) => event.level === "error" || risk.level !== "none"),
    [events],
  );
  if (!flow.phases.length) return null;

  function changeView(next: FlowView) {
    setLocalView(next);
    onViewChange?.(next);
  }

  return (
    <section className="conversation-overview" aria-label="会话执行概览">
      <div className="conversation-overview-row">
        <div className="conversation-title">
          <span className="eyebrow">CONVERSATION</span>
          <h3>对话与执行轨迹</h3>
          <span className="conversation-total" aria-label={`${events.length} 个事件`}>
            <strong>{events.length}</strong> 个事件
          </span>
        </div>
        <div className="conversation-scope" role="tablist" aria-label="消息范围">
          <button
            aria-label="全部消息"
            aria-selected={view === "all"}
            className={view === "all" ? "active" : ""}
            onClick={() => changeView("all")}
            role="tab"
            type="button"
          >
            全部消息 <span>{events.length}</span>
          </button>
          <button
            aria-label="只看高危"
            aria-selected={view === "risk"}
            className={view === "risk" ? "active" : ""}
            onClick={() => changeView("risk")}
            role="tab"
            type="button"
          >
            只看高危 <span>{riskEntries.length}</span>
          </button>
        </div>
        <details className="conversation-summary">
          <summary>
            执行摘要 <span>{flow.phases.length} 轮</span>
          </summary>
          <div className="conversation-stat-list" aria-label="执行统计">
            <span>
              <b>{flow.phases.length}</b> 轮对话
            </span>
            <span>
              <b>{flow.metrics.toolCalls}</b> 工具
            </span>
            <span>
              <b>{flow.metrics.commands}</b> 命令
            </span>
            <span>
              <b>{flow.metrics.fileChanges}</b> 文件
            </span>
            <span className={flow.metrics.errors ? "is-error" : ""}>
              <b>{flow.metrics.errors}</b> 错误
            </span>
            <span className={flow.metrics.riskyOperations ? "is-risk" : ""}>
              <b>{flow.metrics.riskyOperations}</b> 高危
            </span>
          </div>
        </details>
      </div>
      {view === "risk" ? (
        <div className="conversation-risk-panel">
          <div className="conversation-risk-heading">
            <span className="section-icon">
              <Icon name="shield" size={14} />
            </span>
            <span className="eyebrow">RISK REVIEW</span>
            <strong>需要你留意的操作</strong>
            <span className="conversation-risk-count">{riskEntries.length} 项</span>
          </div>
          {riskEntries.length ? (
            <div className="conversation-risk-list">
              {riskEntries.slice(0, 6).map(({ event, risk }) => (
                <button
                  className={`conversation-risk-item risk-${risk.level}`}
                  key={event.id}
                  onClick={() => onSelectEvent?.(event.id)}
                  title={
                    typeof event.payload.command === "string"
                      ? event.payload.command
                      : event.summary
                  }
                  type="button"
                >
                  <i className="conversation-risk-dot" />
                  <span className="conversation-risk-copy">
                    <strong>
                      {event.level === "error"
                        ? "错误事件"
                        : risk.level === "critical"
                          ? "严重风险"
                          : risk.level === "high"
                            ? "高危操作"
                            : "需要注意"}
                    </strong>
                    <span>{event.summary}</span>
                  </span>
                  <time>{timeFormatter.format(new Date(event.timestamp))}</time>
                </button>
              ))}
            </div>
          ) : (
            <p className="conversation-risk-empty">没有发现命中当前风险规则的操作。</p>
          )}
          {riskEntries.length > 6 ? (
            <span className="conversation-risk-more">
              仅显示最近 6 项，完整记录可在对话中查看。
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
