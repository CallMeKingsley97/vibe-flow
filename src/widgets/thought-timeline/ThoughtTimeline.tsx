import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";

import { analyzeEventRisk } from "../../entities/agent-command/model/analyzeAgentCommands";
import type { AgentEvent } from "../../shared/contracts/capture";
import { CollapsibleText } from "../../shared/ui/CollapsibleText";
import { ExecutionFlow, type FlowView } from "../execution-flow/ExecutionFlow";

interface ThoughtTimelineProps {
  events: AgentEvent[];
  loading: boolean;
  focusEventId?: string | null;
  showFlow?: boolean;
}

type ConversationFilter = "all" | "conversation" | "actions" | "reasoning";
type DisplayMode = "chat" | "raw";

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function stringPayload(event: AgentEvent, key: string) {
  const value = event.payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function commandText(event: AgentEvent) {
  const commands = event.payload.commands;
  if (Array.isArray(commands)) {
    const values = commands.filter(
      (value): value is string => typeof value === "string" && Boolean(value.trim()),
    );
    if (values.length) return values.join("\n");
  }
  return stringPayload(event, "command");
}

function eventDetail(event: AgentEvent) {
  if (event.kind === "command" || event.payload.toolCategory === "command") {
    return commandText(event);
  }
  if (event.kind === "file_change" || event.payload.toolCategory === "file") {
    return stringPayload(event, "path") ?? stringPayload(event, "filePath");
  }
  if (event.kind === "tool_call") {
    const operation = stringPayload(event, "operation");
    const toolName = stringPayload(event, "toolName");
    if (operation && toolName) return `${toolName} · ${operation}`;
    return operation ?? toolName;
  }
  if (event.kind === "tool_result") {
    return stringPayload(event, "output") ?? stringPayload(event, "result");
  }
  if (event.kind === "llm_usage") {
    const model = stringPayload(event, "model");
    return model ? `模型：${model}` : null;
  }
  return null;
}

function eventLabel(event: AgentEvent) {
  if (event.kind === "message" && event.source === "user") return "你";
  if (event.kind === "message") return "Agent";
  if (event.kind === "reasoning") return "思考摘要";
  if (event.kind === "tool_call") return "工具调用";
  if (event.kind === "tool_result") return "工具结果";
  if (event.kind === "command") return "执行命令";
  if (event.kind === "file_change") return "文件变更";
  if (event.kind === "llm_usage") return "模型用量";
  return "系统事件";
}

function eventTone(event: AgentEvent) {
  if (event.kind === "message" && event.source === "user") return "user";
  if (event.level === "error") return "error";
  if (event.kind === "message" || event.kind === "reasoning") return "agent";
  if (event.kind === "tool_call" || event.kind === "tool_result" || event.kind === "command") {
    return "action";
  }
  return "system";
}

function matchesFilter(event: AgentEvent, filter: ConversationFilter) {
  if (filter === "all") return true;
  if (filter === "conversation") return event.kind === "message";
  if (filter === "reasoning") return event.kind === "reasoning";
  return ["tool_call", "tool_result", "command", "file_change", "llm_usage"].includes(event.kind);
}

export function ThoughtTimeline({
  events,
  loading,
  focusEventId,
  showFlow = true,
}: ThoughtTimelineProps) {
  const scrollElement = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [view, setView] = useState<FlowView>("all");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("chat");
  const [following, setFollowing] = useState(true);
  const [targetEventId, setTargetEventId] = useState<string | null>(focusEventId ?? null);
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(() => new Set());

  const phaseByEventId = useMemo(() => {
    let phase = 0;
    const map = new Map<string, number>();
    for (const event of events) {
      if (event.kind === "message" && event.source === "user") phase += 1;
      map.set(event.id, phase || 1);
    }
    return map;
  }, [events]);

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return events.filter((event) => {
      const risk = analyzeEventRisk(event);
      const searchable =
        `${event.summary} ${eventDetail(event) ?? ""} ${eventLabel(event)}`.toLocaleLowerCase();
      const matchesScope = view === "all" || event.level === "error" || risk.level !== "none";
      return (
        matchesScope &&
        matchesFilter(event, filter) &&
        (!normalizedQuery || searchable.includes(normalizedQuery))
      );
    });
  }, [events, filter, query, view]);

  const virtualizer = useVirtualizer({
    count: filteredEvents.length,
    getScrollElement: () => scrollElement.current,
    estimateSize: () => 148,
    getItemKey: (index) => filteredEvents[index]?.id ?? index,
    overscan: 10,
    useAnimationFrameWithResizeObserver: true,
  });

  useEffect(() => {
    if (following && filteredEvents.length > 0) {
      virtualizer.scrollToIndex(filteredEvents.length - 1, { align: "end" });
    }
  }, [filteredEvents.length, following, virtualizer]);

  useEffect(() => {
    if (focusEventId && events.some((event) => event.id === focusEventId)) {
      setTargetEventId(focusEventId);
      setFollowing(false);
      setView("all");
      setQuery("");
      setFilter("all");
    }
  }, [events, focusEventId]);

  useEffect(() => {
    if (!targetEventId) return;
    const index = filteredEvents.findIndex((event) => event.id === targetEventId);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "center" });
  }, [filteredEvents, targetEventId, virtualizer]);

  function handleFlowSelect(eventId: string) {
    setFollowing(false);
    setView("all");
    setQuery("");
    setFilter("all");
    setTargetEventId(eventId);
  }

  function handleScroll() {
    const element = scrollElement.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    setFollowing(distanceFromBottom < 80);
  }

  return (
    <div className="thought-timeline">
      {showFlow ? (
        <ExecutionFlow
          events={events}
          onSelectEvent={handleFlowSelect}
          onViewChange={setView}
          view={view}
        />
      ) : null}

      <div className="chat-toolbar">
        <div className="chat-toolbar-main">
          <div className="chat-toolbar-heading">
            <div>
              <h3>消息记录</h3>
            </div>
            <span className="chat-toolbar-count">
              显示 <b>{filteredEvents.length}</b> / {events.length}
            </span>
          </div>

          <div className="chat-toolbar-controls">
            <label className="chat-search">
              <svg aria-hidden="true" viewBox="0 0 20 20">
                <circle cx="8.5" cy="8.5" r="4.75" />
                <path d="m12 12 4 4" />
              </svg>
              <input
                aria-label="搜索会话内容"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索消息、命令或文件"
              />
            </label>
            <div className="chat-mode-switch" role="tablist" aria-label="内容显示方式">
              <button
                aria-selected={displayMode === "chat"}
                className={displayMode === "chat" ? "active" : ""}
                onClick={() => setDisplayMode("chat")}
                role="tab"
                type="button"
              >
                对话
              </button>
              <button
                aria-selected={displayMode === "raw"}
                className={displayMode === "raw" ? "active" : ""}
                onClick={() => setDisplayMode("raw")}
                role="tab"
                type="button"
              >
                原始事件
              </button>
            </div>
          </div>
        </div>

        <div className="chat-filter-row">
          <div className="chat-filter-group" aria-label="内容类型">
            {(
              [
                ["all", "全部"],
                ["conversation", "对话"],
                ["actions", "执行"],
                ["reasoning", "推理"],
              ] as const
            ).map(([value, label]) => (
              <button
                aria-pressed={filter === value}
                className={filter === value ? "active" : ""}
                key={value}
                onClick={() => setFilter(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <label className="chat-follow-toggle">
            <input
              checked={following}
              onChange={(event) => setFollowing(event.target.checked)}
              type="checkbox"
            />
            <span aria-hidden="true" className="chat-follow-track">
              <i />
            </span>
            <span>跟随最新</span>
          </label>
        </div>
      </div>

      <div
        className={`chat-stream ${displayMode === "raw" ? "is-raw" : ""}`}
        onScroll={handleScroll}
        ref={scrollElement}
      >
        {loading && events.length === 0 ? (
          <div className="empty-state">正在加载会话内容…</div>
        ) : null}
        {!loading && filteredEvents.length === 0 ? (
          <div className="chat-empty">
            <strong>{view === "risk" ? "没有风险或错误事件" : "没有匹配的会话内容"}</strong>
            <span>试试清除搜索词或切换上方筛选。</span>
          </div>
        ) : null}
        <div className="chat-virtual-space" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const event = filteredEvents[virtualItem.index];
            if (!event) return null;
            const userMessage = event.kind === "message" && event.source === "user";
            const risk = analyzeEventRisk(event);
            const detail = eventDetail(event);
            return (
              <article
                className={`chat-item chat-${eventTone(event)} risk-${risk.level} ${
                  event.id === targetEventId ? "focused" : ""
                }`}
                data-index={virtualItem.index}
                key={event.id}
                ref={virtualizer.measureElement}
                style={{ transform: `translateY(${virtualItem.start}px)` }}
              >
                {userMessage ? (
                  <div className="chat-phase-divider">
                    <span>第 {phaseByEventId.get(event.id) ?? 1} 轮任务</span>
                  </div>
                ) : null}
                <div className="chat-row">
                  {!userMessage ? (
                    <div className="chat-avatar" aria-hidden="true">
                      {eventTone(event) === "action"
                        ? "↳"
                        : eventTone(event) === "error"
                          ? "!"
                          : "A"}
                    </div>
                  ) : null}
                  <div className="chat-message">
                    <div className="chat-author">
                      <strong>{eventLabel(event)}</strong>
                      <span className="chat-kind">{event.kind.replaceAll("_", " ")}</span>
                      <time>{timeFormatter.format(new Date(event.timestamp))}</time>
                    </div>
                    <div className="chat-bubble">
                      <CollapsibleText
                        className="chat-summary"
                        collapseAt={displayMode === "raw" ? 260 : 220}
                        expanded={expandedEventIds.has(event.id)}
                        maxHeight={displayMode === "raw" ? 112 : 96}
                        onExpandedChange={(expanded) => {
                          setFollowing(false);
                          setExpandedEventIds((current) => {
                            const next = new Set(current);
                            if (expanded) next.add(event.id);
                            else next.delete(event.id);
                            return next;
                          });
                        }}
                        text={event.summary}
                      />
                      {detail ? <pre className="chat-detail">{detail}</pre> : null}
                      {risk.reason ? <span className="chat-risk-label">{risk.reason}</span> : null}
                      {event.level === "error" ? (
                        <span className="chat-risk-label">错误事件</span>
                      ) : null}
                      {displayMode === "raw" ? (
                        <details className="chat-raw-payload">
                          <summary>查看原始载荷</summary>
                          <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                        </details>
                      ) : null}
                      <div className="chat-meta">
                        <span>#{event.sequence}</span>
                        <span>{event.source}</span>
                        {event.level !== "info" ? <span>{event.level}</span> : null}
                        {event.payload.sourceFile &&
                        typeof event.payload.sourceFile === "string" ? (
                          <span title={event.payload.sourceFile}>{event.payload.sourceFile}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {userMessage ? (
                    <div className="chat-avatar chat-avatar-user" aria-hidden="true">
                      U
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
