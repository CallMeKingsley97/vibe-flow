import { useEffect, useMemo, useState } from "react";

import {
  buildExecutionFlow,
  type ExecutionFlowNode,
} from "../../entities/execution-flow/model/buildExecutionFlow";
import type { AgentEvent } from "../../shared/contracts/capture";

interface ExecutionFlowProps {
  events: AgentEvent[];
  initialView?: "all" | "risk";
  onSelectEvent: (eventId: string) => void;
}

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const criticalKinds = new Set<ExecutionFlowNode["kind"]>(["skill", "mcp", "file", "error", "plan"]);
const PAGE_SIZE = 8;

function isRiskNode(node: ExecutionFlowNode) {
  return node.riskLevel === "high" || node.riskLevel === "critical";
}

function collapsedNodes(nodes: ExecutionFlowNode[]) {
  if (nodes.length <= 12) return nodes;
  const selected = new Map<string, ExecutionFlowNode>();
  for (const node of nodes.slice(0, 3)) selected.set(node.id, node);
  for (const node of nodes.filter((item) => criticalKinds.has(item.kind)).slice(0, 7)) {
    selected.set(node.id, node);
  }
  for (const node of nodes.filter(isRiskNode)) selected.set(node.id, node);
  for (const node of nodes.slice(-4)) selected.set(node.id, node);
  return [...selected.values()].sort((left, right) => left.startSequence - right.startSequence);
}

export function ExecutionFlow({ events, initialView = "all", onSelectEvent }: ExecutionFlowProps) {
  const flow = useMemo(() => buildExecutionFlow(events), [events]);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);
  const [view, setView] = useState<"all" | "risk">(initialView);
  const [page, setPage] = useState(0);

  const visiblePhases = useMemo(
    () =>
      view === "risk" ? flow.phases.filter((phase) => phase.nodes.some(isRiskNode)) : flow.phases,
    [flow.phases, view],
  );
  const pageCount = Math.max(1, Math.ceil(visiblePhases.length / PAGE_SIZE));
  const pagePhases = visiblePhases.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  if (!flow.phases.length) return null;

  return (
    <section className="execution-flow">
      <div className="execution-flow-header">
        <div>
          <span className="eyebrow">PROCESS OVERVIEW</span>
          <h3>执行流程</h3>
          <p>先看目标和关键动作；点击任一节点可定位到下方原始事件。</p>
        </div>
        <div className="flow-metrics">
          <span>
            阶段 <b>{flow.phases.length}</b>
          </span>
          <span>
            Skill <b>{flow.metrics.skills}</b>
          </span>
          <span>
            MCP <b>{flow.metrics.mcpCalls}</b>
          </span>
          <span>
            工具 <b>{flow.metrics.toolCalls}</b>
          </span>
          <span>
            文件 <b>{flow.metrics.fileChanges}</b>
          </span>
          <span>
            命令 <b>{flow.metrics.commands}</b>
          </span>
          <span className={flow.metrics.errors ? "has-error" : ""}>
            错误 <b>{flow.metrics.errors}</b>
          </span>
          <span className={flow.metrics.riskyOperations ? "has-risk" : ""}>
            高危 <b>{flow.metrics.riskyOperations}</b>
          </span>
        </div>
      </div>
      <div className="flow-navigation">
        <div className="flow-view-switch" role="tablist" aria-label="流程显示范围">
          <button
            className={view === "all" ? "active" : ""}
            onClick={() => {
              setView("all");
              setPage(0);
            }}
            role="tab"
            type="button"
          >
            全部阶段
          </button>
          <button
            className={view === "risk" ? "active" : ""}
            onClick={() => {
              setView("risk");
              setPage(0);
            }}
            role="tab"
            type="button"
          >
            只看高危
          </button>
        </div>
        <div className="flow-pager">
          <button disabled={page === 0} onClick={() => setPage((value) => value - 1)} type="button">
            ←
          </button>
          <span>
            {visiblePhases.length ? page * PAGE_SIZE + 1 : 0}–
            {Math.min((page + 1) * PAGE_SIZE, visiblePhases.length)} / {visiblePhases.length}
          </span>
          <button
            disabled={page >= pageCount - 1}
            onClick={() => setPage((value) => value + 1)}
            type="button"
          >
            →
          </button>
          <button
            disabled={page >= pageCount - 1}
            onClick={() => setPage(pageCount - 1)}
            type="button"
          >
            最近阶段
          </button>
        </div>
      </div>
      {visiblePhases.length > PAGE_SIZE ? (
        <div className="flow-minimap" aria-label="长会话阶段导航">
          {visiblePhases.map((phase, index) => {
            const hasRisk = phase.nodes.some(isRiskNode);
            const hasError = phase.nodes.some((node) => node.kind === "error");
            return (
              <button
                aria-label={`阶段 ${index + 1}：${phase.title}`}
                className={`${Math.floor(index / PAGE_SIZE) === page ? "active" : ""} ${hasRisk ? "has-risk" : ""} ${hasError ? "has-error" : ""}`}
                key={phase.id}
                onClick={() => setPage(Math.floor(index / PAGE_SIZE))}
                title={`${index + 1}. ${phase.title}`}
                type="button"
              />
            );
          })}
        </div>
      ) : null}
      <div className="flow-phase-track">
        {pagePhases.map((phase) => {
          const phaseIndex = flow.phases.indexOf(phase);
          const expanded = expandedPhase === phase.id;
          const nodes = expanded ? phase.nodes : collapsedNodes(phase.nodes);
          const hiddenCount = phase.nodes.length - nodes.length;
          return (
            <article
              className={`flow-phase ${phase.nodes.some(isRiskNode) ? "has-risk" : ""}`}
              key={phase.id}
            >
              <header>
                <div className="flow-phase-index">{phaseIndex + 1}</div>
                <div>
                  <time>{timeFormatter.format(new Date(phase.startedAt))}</time>
                  <h4 title={phase.title}>{phase.title}</h4>
                </div>
              </header>
              <div className="flow-node-list">
                {nodes.length ? (
                  nodes.map((node) => (
                    <button
                      className={`flow-node kind-${node.kind} risk-${node.riskLevel}`}
                      key={node.id}
                      onClick={() => onSelectEvent(node.eventId)}
                      title={node.detail ?? node.label}
                      type="button"
                    >
                      <i />
                      <span>
                        <small>{timeFormatter.format(new Date(node.startedAt))}</small>
                        <strong>{node.label}</strong>
                        {node.detail ? <em>{node.detail}</em> : null}
                        {node.riskReason ? <mark>{node.riskReason}</mark> : null}
                      </span>
                      {node.count > 1 ? <b>×{node.count}</b> : null}
                    </button>
                  ))
                ) : (
                  <div className="flow-empty">该阶段只有对话消息</div>
                )}
              </div>
              {hiddenCount > 0 || expanded ? (
                <button
                  className="flow-expand"
                  onClick={() => setExpandedPhase(expanded ? null : phase.id)}
                  type="button"
                >
                  {expanded ? "收起关键节点" : `展开另外 ${hiddenCount} 个节点`}
                </button>
              ) : null}
            </article>
          );
        })}
        {!pagePhases.length ? (
          <div className="flow-filter-empty">当前会话没有高危操作阶段</div>
        ) : null}
      </div>
    </section>
  );
}
