import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";

import type { AgentEvent } from "../../shared/contracts/capture";
import { ExecutionFlow } from "../execution-flow/ExecutionFlow";

interface ThoughtTimelineProps {
  events: AgentEvent[];
  loading: boolean;
  focusEventId?: string | null;
  showFlow?: boolean;
}

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function ThoughtTimeline({
  events,
  loading,
  focusEventId,
  showFlow = true,
}: ThoughtTimelineProps) {
  const scrollElement = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [level, setLevel] = useState("all");
  const [following, setFollowing] = useState(true);
  const [targetEventId, setTargetEventId] = useState<string | null>(focusEventId ?? null);

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return events.filter(
      (event) =>
        (kind === "all" || event.kind === kind) &&
        (level === "all" || event.level === level) &&
        (!normalizedQuery || event.summary.toLocaleLowerCase().includes(normalizedQuery)),
    );
  }, [events, kind, level, query]);

  const virtualizer = useVirtualizer({
    count: filteredEvents.length,
    getScrollElement: () => scrollElement.current,
    estimateSize: () => 80,
    getItemKey: (index) => filteredEvents[index]?.id ?? index,
    overscan: 12,
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
      setQuery("");
      setKind("all");
      setLevel("all");
    }
  }, [events, focusEventId]);

  useEffect(() => {
    if (!targetEventId) return;
    const index = filteredEvents.findIndex((event) => event.id === targetEventId);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "center" });
  }, [filteredEvents, targetEventId, virtualizer]);

  function handleFlowSelect(eventId: string) {
    setFollowing(false);
    setQuery("");
    setKind("all");
    setLevel("all");
    setTargetEventId(eventId);
  }

  function handleScroll() {
    const element = scrollElement.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    setFollowing(distanceFromBottom < 80);
  }

  return (
    <>
      {showFlow ? <ExecutionFlow events={events} onSelectEvent={handleFlowSelect} /> : null}
      <div className="timeline-section-title">
        <div>
          <span className="eyebrow">RAW EVENTS</span>
          <h3>事件明细</h3>
        </div>
        <span>保留完整顺序、筛选和原始内容</span>
      </div>
      <div className="timeline-filters">
        <label className="timeline-search">
          <svg aria-hidden="true" viewBox="0 0 20 20">
            <circle cx="8.5" cy="8.5" r="4.75" />
            <path d="m12 12 4 4" />
          </svg>
          <input
            aria-label="搜索事件"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索事件内容"
          />
        </label>
        <label className={`timeline-select ${kind !== "all" ? "active" : ""}`}>
          <select
            aria-label="事件类型"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="all">全部类型</option>
            <option value="message">Agent 消息</option>
            <option value="reasoning">Agent 推理摘要</option>
            <option value="tool_call">工具调用</option>
            <option value="llm_usage">Token 用量</option>
          </select>
          <svg aria-hidden="true" viewBox="0 0 20 20">
            <path d="m6 8 4 4 4-4" />
          </svg>
        </label>
        <label className={`timeline-select level-select ${level !== "all" ? "active" : ""}`}>
          <select
            aria-label="事件级别"
            value={level}
            onChange={(event) => setLevel(event.target.value)}
          >
            <option value="all">全部级别</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
          <svg aria-hidden="true" viewBox="0 0 20 20">
            <path d="m6 8 4 4 4-4" />
          </svg>
        </label>
        <label className="follow-toggle">
          <input
            checked={following}
            onChange={(event) => setFollowing(event.target.checked)}
            type="checkbox"
          />
          <span aria-hidden="true" className="follow-toggle-track">
            <i />
          </span>
          <span>跟随最新</span>
        </label>
        <span className="event-count">
          <span>显示</span>
          <strong>{filteredEvents.length}</strong>
          <i>/</i>
          {events.length}
        </span>
      </div>
      <div className="timeline" onScroll={handleScroll} ref={scrollElement}>
        {loading && events.length === 0 ? <div className="empty-state">正在加载事件…</div> : null}
        {!loading && filteredEvents.length === 0 ? (
          <div className="empty-state">当前筛选条件下没有事件</div>
        ) : null}
        <div className="timeline-virtual-space" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const event = filteredEvents[virtualItem.index];
            if (!event) return null;
            return (
              <article
                className={`timeline-item level-${event.level} ${event.id === targetEventId ? "focused" : ""}`}
                data-index={virtualItem.index}
                key={event.id}
                ref={virtualizer.measureElement}
                style={{ transform: `translateY(${virtualItem.start}px)` }}
              >
                <div className="timeline-meta">
                  <span>#{event.sequence}</span>
                  <time>{timeFormatter.format(new Date(event.timestamp))}</time>
                </div>
                <div>
                  <div className="timeline-kind">{event.kind.replaceAll("_", " ")}</div>
                  <p className="timeline-summary">{event.summary}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </>
  );
}
