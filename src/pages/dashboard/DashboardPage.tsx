import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useCaptureSessions } from "../../features/capture-session/model/useCaptureSessions";
import { useGlobalSearch } from "../../features/capture-session/model/useGlobalSearch";
import { useSessionEvents } from "../../features/capture-session/model/useSessionEvents";
import { useLocalHistory } from "../../features/local-history/model/useLocalHistory";
import { SessionUsageSummary } from "../../entities/session-usage/ui/SessionUsageSummary";
import type {
  CaptureSession,
  SearchHit,
  SessionSource,
  SourceScanStatus,
} from "../../shared/contracts/capture";
import { ThoughtTimeline } from "../../widgets/thought-timeline/ThoughtTimeline";
import { AgentInsights } from "../../widgets/agent-insights/AgentInsights";

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const sourceLabels: Record<SessionSource, string> = {
  codex: "Codex",
  claude: "Claude",
  gemini: "Gemini",
  cursor: "Cursor",
};

const matchFieldLabels: Record<SearchHit["matchField"], string> = {
  session_name: "会话名",
  workspace: "项目",
  summary: "消息",
  tool_name: "工具",
  skill: "Skill",
  mcp: "MCP",
  command: "命令",
};

type SourceFilter = "all" | SessionSource;
type SessionSortOrder = "desc" | "asc";

function SourceStatus({ status }: { status: SourceScanStatus }) {
  return (
    <div className={`source-status ${status.detected ? "detected" : ""}`}>
      <span className="source-status-name">{sourceLabels[status.source]}</span>
      <span>{status.detected ? `${status.sessionCount} 个会话` : "未检测到"}</span>
      {status.error ? (
        <span className="source-status-error" title={status.error}>
          解析警告
        </span>
      ) : null}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg aria-hidden="true" className="star-icon" viewBox="0 0 16 16">
      {filled ? (
        <path d="M8 1.6 9.9 5.7l4.5.4-3.4 2.9 1 4.4L8 11.2 3.9 13.4l1-4.4L1.6 6.1l4.5-.4L8 1.6Z" />
      ) : (
        <path
          d="M8 2.3 9.5 5.7l3.7.3-2.8 2.4.8 3.6L8 10.2 4.8 12l.8-3.6L2.8 6l3.7-.3L8 2.3Z"
          fill="none"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.3"
        />
      )}
    </svg>
  );
}

function SortIcon({ order }: { order: SessionSortOrder }) {
  return (
    <svg aria-hidden="true" className="sort-icon" viewBox="0 0 16 16">
      {order === "desc" ? (
        <>
          <path
            d="M4 3.5h6M4 6.5h4.5M4 9.5h3"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.4"
          />
          <path
            d="M12 3.5v9M12 12.5 10.2 10.7M12 12.5l1.8-1.8"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.4"
          />
        </>
      ) : (
        <>
          <path
            d="M4 3.5h3M4 6.5h4.5M4 9.5h6"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.4"
          />
          <path
            d="M12 12.5v-9M12 3.5 10.2 5.3M12 3.5l1.8 1.8"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.4"
          />
        </>
      )}
    </svg>
  );
}

export function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const workspaceFilter = searchParams.get("workspace");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<SessionSortOrder>("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const sessionModel = useCaptureSessions(sourceFilter, favoriteOnly);
  const refreshSessions = sessionModel.refresh;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const localHistory = useLocalHistory(refreshSessions, selectedId);
  const eventModel = useSessionEvents(selectedId, localHistory.revision);
  const [detailView, setDetailView] = useState<"insights" | "timeline">("insights");
  const [focusEventId, setFocusEventId] = useState<string | null>(null);
  const searchModel = useGlobalSearch(searchQuery, sourceFilter, workspaceFilter);

  const filteredSessions = useMemo(() => {
    const sessions = workspaceFilter
      ? sessionModel.sessions.filter((session) => session.workspace === workspaceFilter)
      : sessionModel.sessions;
    const direction = sortOrder === "desc" ? -1 : 1;
    return [...sessions].sort((left, right) => {
      const leftTime = Date.parse(left.updatedAt);
      const rightTime = Date.parse(right.updatedAt);
      if (leftTime === rightTime) return left.id.localeCompare(right.id) * direction;
      return (leftTime - rightTime) * direction;
    });
  }, [sessionModel.sessions, sortOrder, workspaceFilter]);

  useEffect(() => {
    if (!selectedId && filteredSessions[0]) setSelectedId(filteredSessions[0].id);
  }, [filteredSessions, selectedId]);

  useEffect(() => {
    if (!workspaceFilter && !favoriteOnly) return;
    if (!filteredSessions.some((session) => session.id === selectedId)) {
      setSelectedId(filteredSessions[0]?.id ?? null);
    }
  }, [favoriteOnly, filteredSessions, selectedId, workspaceFilter]);

  const selected = useMemo(
    () => sessionModel.sessions.find((session) => session.id === selectedId) ?? null,
    [selectedId, sessionModel.sessions],
  );
  const visibleError =
    sessionModel.error ?? localHistory.error ?? eventModel.error ?? searchModel.error;

  return (
    <div className="dashboard-page">
      {visibleError ? <div className="error-banner">{visibleError}</div> : null}
      <div className="source-overview panel">
        <div>
          <h2>本地 Agent 会话</h2>
          <p>自动读取历史记录，并监听新会话和新增消息。</p>
        </div>
        <div className="source-status-list">
          {localHistory.statuses.map((status) => (
            <SourceStatus key={status.source} status={status} />
          ))}
        </div>
        <button
          className="secondary-button"
          disabled={localHistory.scanning}
          onClick={() => void localHistory.scan()}
          type="button"
        >
          {localHistory.scanning ? "正在扫描…" : "重新扫描"}
        </button>
      </div>

      <div className="dashboard-grid">
        <aside className="sidebar">
          <section className="panel session-browser">
            <div className="panel-header">
              <h2>会话</h2>
              <span className="badge stopped">{filteredSessions.length}</span>
            </div>

            <div className="session-toolbar">
              <div className="session-toolbar-head">
                <label className="session-search">
                  <SearchIcon />
                  <input
                    aria-label="全局搜索"
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="搜索消息、命令、工具、Skill…"
                    type="search"
                    value={searchQuery}
                  />
                </label>

                <div className="session-toolbar-actions">
                  <button
                    aria-label={
                      sortOrder === "desc"
                        ? "当前按时间倒序，点击切换为时间顺序"
                        : "当前按时间顺序，点击切换为时间倒序"
                    }
                    className="session-sort-toggle"
                    onClick={() =>
                      setSortOrder((value) => (value === "desc" ? "asc" : "desc"))
                    }
                    title={sortOrder === "desc" ? "时间倒序（最新优先）" : "时间顺序（最早优先）"}
                    type="button"
                  >
                    <SortIcon order={sortOrder} />
                    {sortOrder === "desc" ? "最新优先" : "最早优先"}
                  </button>
                  <button
                    aria-pressed={favoriteOnly}
                    className={`session-favorite-filter ${favoriteOnly ? "active" : ""}`}
                    onClick={() => {
                      setFavoriteOnly((value) => !value);
                      setSelectedId(null);
                    }}
                    type="button"
                  >
                    <StarIcon filled={favoriteOnly} />
                    收藏
                  </button>
                </div>
              </div>

              <div className="source-tabs">
                {(["all", "codex", "claude", "gemini", "cursor"] as const).map((source) => (
                  <button
                    className={sourceFilter === source ? "active" : ""}
                    key={source}
                    onClick={() => {
                      setSourceFilter(source);
                      setSelectedId(null);
                    }}
                    type="button"
                  >
                    {source === "all" ? "全部" : sourceLabels[source]}
                  </button>
                ))}
              </div>

              {workspaceFilter ? (
                <div className="workspace-filter-chip" title={workspaceFilter}>
                  <span>项目：{workspaceFilter}</span>
                  <button
                    onClick={() => {
                      const next = new URLSearchParams(searchParams);
                      next.delete("workspace");
                      setSearchParams(next, { replace: true });
                      setSelectedId(null);
                    }}
                    type="button"
                  >
                    清除
                  </button>
                </div>
              ) : null}
            </div>

            {searchModel.active ? (
              <div className="search-results">
                {searchModel.loading ? <div className="empty-state">搜索中…</div> : null}
                {!searchModel.loading && searchModel.hits.length === 0 ? (
                  <div className="empty-state">没有匹配结果</div>
                ) : null}
                {searchModel.hits.map((hit) => (
                  <button
                    className="search-hit"
                    key={`${hit.sessionId}:${hit.eventId ?? hit.matchField}:${hit.snippet}`}
                    onClick={() => {
                      setSelectedId(hit.sessionId);
                      if (hit.eventId) {
                        setFocusEventId(hit.eventId);
                        setDetailView("timeline");
                      }
                    }}
                    type="button"
                  >
                    <div className="search-hit-title">
                      <span>{hit.sessionName}</span>
                      <em>{matchFieldLabels[hit.matchField]}</em>
                    </div>
                    <div className="search-hit-snippet">{hit.snippet}</div>
                    <div className="search-hit-meta">
                      <span className={`source-badge source-${hit.source}`}>
                        {sourceLabels[hit.source]}
                      </span>
                      {hit.workspace ? <span title={hit.workspace}>{hit.workspace}</span> : null}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <>
                {sessionModel.loading ? <div className="empty-state">正在加载…</div> : null}
                {!sessionModel.loading && filteredSessions.length === 0 ? (
                  <div className="empty-state">
                    {favoriteOnly
                      ? "还没有收藏的会话"
                      : workspaceFilter
                        ? "该项目下没有可读取的会话"
                        : "这个来源还没有可读取的会话"}
                  </div>
                ) : null}
                <div className="session-list">
                  {filteredSessions.map((session: CaptureSession) => (
                    <div
                      className={`session-item ${session.id === selectedId ? "selected" : ""}`}
                      key={session.id}
                    >
                      <button
                        className="session-item-main"
                        onClick={() => setSelectedId(session.id)}
                        type="button"
                      >
                        <div className="session-title">
                          <span>{session.name}</span>
                          <span className={`source-badge source-${session.source}`}>
                            {sourceLabels[session.source]}
                          </span>
                        </div>
                        <div className="session-meta">
                          <span>{dateFormatter.format(new Date(session.updatedAt))}</span>
                          <span>·</span>
                          <span>{session.lastSequence} 个事件</span>
                        </div>
                        <SessionUsageSummary compact session={session} />
                        {session.workspace ? (
                          <div className="session-workspace" title={session.workspace}>
                            {session.workspace}
                          </div>
                        ) : null}
                      </button>
                      <button
                        aria-label={session.isFavorite ? "取消收藏" : "收藏"}
                        className={`session-favorite ${session.isFavorite ? "active" : ""}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          void sessionModel.toggleFavorite(session.id, !session.isFavorite);
                        }}
                        type="button"
                      >
                        {session.isFavorite ? "★" : "☆"}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </aside>

        <section className="workspace">
          <div className="panel">
            <div className="panel-header session-detail-header">
              <div>
                <div className="detail-title-row">
                  <h2>{selected?.name ?? "选择一个本地会话"}</h2>
                  {selected ? (
                    <span className={`source-badge source-${selected.source}`}>
                      {sourceLabels[selected.source]}
                    </span>
                  ) : null}
                  {selected ? (
                    <button
                      aria-label={selected.isFavorite ? "取消收藏" : "收藏"}
                      className={`session-favorite detail ${selected.isFavorite ? "active" : ""}`}
                      onClick={() =>
                        void sessionModel.toggleFavorite(selected.id, !selected.isFavorite)
                      }
                      type="button"
                    >
                      {selected.isFavorite ? "★ 已收藏" : "☆ 收藏"}
                    </button>
                  ) : null}
                </div>
                {selected?.workspace ? <p>{selected.workspace}</p> : null}
                {selected ? <SessionUsageSummary session={selected} /> : null}
              </div>
            </div>
            {selected ? (
              <>
                <div className="detail-view-tabs" role="tablist" aria-label="会话详情视图">
                  <button
                    aria-selected={detailView === "insights"}
                    className={detailView === "insights" ? "active" : ""}
                    onClick={() => setDetailView("insights")}
                    role="tab"
                    type="button"
                  >
                    Agent 统计
                  </button>
                  <button
                    aria-selected={detailView === "timeline"}
                    className={detailView === "timeline" ? "active" : ""}
                    onClick={() => setDetailView("timeline")}
                    role="tab"
                    type="button"
                  >
                    执行流程与事件 <span>{eventModel.events.length}</span>
                  </button>
                </div>
                {detailView === "insights" ? (
                  <AgentInsights
                    events={eventModel.events}
                    loading={eventModel.loading}
                    onSelectEvent={(eventId) => {
                      setFocusEventId(eventId);
                      setDetailView("timeline");
                    }}
                  />
                ) : (
                  <ThoughtTimeline
                    events={eventModel.events}
                    loading={eventModel.loading}
                    focusEventId={focusEventId}
                  />
                )}
              </>
            ) : (
              <div className="empty-state">
                扫描完成后，从左侧选择 Codex、Claude、Gemini 或 Cursor 会话。
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
