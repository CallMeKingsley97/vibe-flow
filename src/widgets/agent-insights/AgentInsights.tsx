import { useMemo } from "react";

import {
  buildAgentInsights,
  type RankedAgentItem,
} from "../../entities/agent-insights/model/buildAgentInsights";
import type { AgentEvent } from "../../shared/contracts/capture";

interface AgentInsightsProps {
  events: AgentEvent[];
  loading: boolean;
  onSelectEvent: (eventId: string) => void;
}

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function duration(value: number) {
  if (value < 60_000) return `${Math.round(value / 1000)} 秒`;
  if (value < 3_600_000) return `${Math.round(value / 60_000)} 分钟`;
  return `${(value / 3_600_000).toFixed(1)} 小时`;
}

function Ranking({
  title,
  items,
  empty,
}: {
  title: string;
  items: RankedAgentItem[];
  empty: string;
}) {
  const max = items[0]?.count ?? 1;
  return (
    <section className="insight-ranking">
      <h4>{title}</h4>
      {items.length ? (
        items.map((item) => (
          <div className="insight-rank-row" key={item.name}>
            <span title={item.name}>{item.name}</span>
            <i>
              <b style={{ width: `${(item.count / max) * 100}%` }} />
            </i>
            <strong>{item.count}</strong>
          </div>
        ))
      ) : (
        <p>{empty}</p>
      )}
    </section>
  );
}

export function AgentInsights({ events, loading, onSelectEvent }: AgentInsightsProps) {
  const data = useMemo(() => buildAgentInsights(events), [events]);
  if (loading && !events.length) return <div className="empty-state">正在分析 Agent 会话…</div>;
  if (!events.length) return <div className="empty-state">当前会话还没有可统计的 Agent 事件</div>;

  const metrics = [
    ["任务阶段", data.phases],
    ["持续时间", duration(data.durationMs)],
    ["用户消息", data.userMessages],
    ["Agent 消息", data.agentMessages],
    ["工具调用", data.toolCalls],
    ["Skill", data.skills],
    ["MCP", data.mcpCalls],
    ["命令", data.commands],
    ["文件操作", data.fileChanges],
    ["错误", data.errors],
    ["高危操作", data.riskyOperations],
  ] as const;

  return (
    <div className="agent-insights">
      <div className="insight-hero">
        <div>
          <span className="eyebrow">AGENT INSIGHTS</span>
          <h3>会话执行概览</h3>
          <p>统计仅来自 Agent 自身的本地历史、消息和工具事件。</p>
        </div>
        <strong>
          {data.totalEvents}
          <small>总事件</small>
        </strong>
      </div>
      <div className="insight-metrics">
        {metrics.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <section className={`risk-operations ${data.riskOperations.length ? "has-risk" : ""}`}>
        <header>
          <div>
            <span className="eyebrow">RISK REVIEW</span>
            <h4>高危与需注意操作</h4>
          </div>
          <strong>{data.riskOperations.length}</strong>
        </header>
        {data.riskOperations.length ? (
          <div className="risk-operation-list">
            {data.riskOperations.map((item) => (
              <button
                className={`risk-operation risk-${item.riskLevel}`}
                key={item.id}
                onClick={() => onSelectEvent(item.eventId)}
                type="button"
              >
                <span>
                  <b>{item.title}</b>
                  <time>{timeFormatter.format(new Date(item.timestamp))}</time>
                </span>
                <strong>{item.riskReason}</strong>
                <code>{item.detail}</code>
              </button>
            ))}
          </div>
        ) : (
          <p>没有发现命中当前风险规则的操作。</p>
        )}
      </section>
      <div className="insight-rankings">
        <Ranking title="常用命令" items={data.topCommands} empty="没有提取到具体命令" />
        <Ranking title="常用工具" items={data.topTools} empty="没有普通工具调用" />
        <Ranking title="使用的 Skill" items={data.topSkills} empty="没有识别到 Skill" />
        <Ranking title="MCP 服务" items={data.topMcpServers} empty="没有识别到 MCP 调用" />
        <Ranking title="事件构成" items={data.eventKinds} empty="没有事件" />
      </div>
      <details className="command-audit">
        <summary>
          命令记录 <span>{data.commandObservations.length}</span>
        </summary>
        {data.commandObservations.length ? (
          <div className="command-audit-list">
            {data.commandObservations
              .slice()
              .reverse()
              .slice(0, 80)
              .map((item) => (
                <button
                  className={`command-audit-row risk-${item.riskLevel}`}
                  key={item.id}
                  onClick={() => onSelectEvent(item.eventId)}
                  type="button"
                >
                  <span>#{item.sequence}</span>
                  <code>{item.command}</code>
                  <time>{timeFormatter.format(new Date(item.timestamp))}</time>
                </button>
              ))}
          </div>
        ) : (
          <p>当前来源没有提供具体命令内容。</p>
        )}
      </details>
    </div>
  );
}
