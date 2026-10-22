import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useCaptureSessions } from "../../features/capture-session/model/useCaptureSessions";
import { useGlobalSearch } from "../../features/capture-session/model/useGlobalSearch";
import { useSessionEvents } from "../../features/capture-session/model/useSessionEvents";
import { useLocalHistory } from "../../features/local-history/model/useLocalHistory";
import { SessionUsageSummary } from "../../entities/session-usage/ui/SessionUsageSummary";
import {
  groupSessionsByProject,
  projectKey,
  type SessionSortOrder,
} from "../../entities/session-group/model/groupSessionsByProject";
import type { SearchHit, SessionSource, SourceScanStatus } from "../../shared/contracts/capture";
import { sessionSourceLabels } from "../../shared/lib/sessionSource";
import { Icon } from "../../shared/ui/icons";
import { ProjectSessionTree } from "../../widgets/session-tree/ProjectSessionTree";
import { ThoughtTimeline } from "../../widgets/thought-timeline/ThoughtTimeline";
import { AgentInsights } from "../../widgets/agent-insights/AgentInsights";

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

const COLLAPSED_PROJECTS_KEY = "vibe-flow.collapsed-projects";

function readCollapsedProjects(): Set<string> {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_PROJECTS_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((value): value is string => typeof value === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

function SourceStatus({ status }: { status: SourceScanStatus }) {
  return (
    <div
      className={`source-status ${status.detected ? "detected" : ""}`}
      title={status.error ?? undefined}
    >
      <span className={`source-dot source-${status.source}`} aria-hidden="true" />
      <span className="source-status-name">{sessionSourceLabels[status.source]}</span>
      <span className="source-status-count">{status.detected ? status.sessionCount : "—"}</span>
      {status.error ? <Icon className="source-status-error" name="alert" size={12} /> : null}
    </div>
  );
}

export function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const workspaceFilter = searchParams.get("workspace");
  const sessionParam = searchParams.get("session");
  const eventParam = searchParams.get("event");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<SessionSortOrder>("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(readCollapsedProjects);
  const sessionModel = useCaptureSessions(sourceFilter, favoriteOnly);
  const refreshSessions = sessionModel.refresh;
  const [selectedId, setSelectedId] = useState<string | null>(sessionParam);
  const localHistory = useLocalHistory(refreshSessions, selectedId);
  const eventModel = useSessionEvents(selectedId, localHistory.revision);
  const [detailView, setDetailView] = useState<"insights" | "timeline">(
    eventParam ? "timeline" : "insights",
  );
  const [focusEventId, setFocusEventId] = useState<string | null>(eventParam);
  const searchModel = useGlobalSearch(searchQuery, sourceFilter, workspaceFilter);

  const filteredSessions = useMemo(() => {
    if (!workspaceFilter) return sessionModel.sessions;
    const key = projectKey(workspaceFilter);
    return sessionModel.sessions.filter((session) => projectKey(session.workspace) === key);
  }, [sessionModel.sessions, workspaceFilter]);

  const projectGroups = useMemo(
    () => groupSessionsByProject(filteredSessions, sortOrder),
    [filteredSessions, sortOrder],
  );

  const selectedSessionKey = useMemo(() => {
    const session = sessionModel.sessions.find((item) => item.id === selectedId);
    return session ? projectKey(session.workspace) : null;
  }, [selectedId, sessionModel.sessions]);

  // Expand the project that owns a newly selected session (deep link, search
  // result, or manual pick) without fighting a manual "collapse all".
  const previousSelection = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedId || !selectedSessionKey) return;
    const token = `${selectedSessionKey}:${selectedId}`;
    if (previousSelection.current === token) return;
    previousSelection.current = token;
    setCollapsedProjects((current) => {
      if (!current.has(selectedSessionKey)) return current;
      const next = new Set(current);
      next.delete(selectedSessionKey);
      return next;
    });
  }, [selectedId, selectedSessionKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSED_PROJECTS_KEY, JSON.stringify([...collapsedProjects]));
    } catch {
      // Persisting the tree state is a convenience; ignore storage failures.
    }
  }, [collapsedProjects]);

  // A workspace filter can also arrive from the insights page. Expanding the
  // filtered project keeps the sidebar useful instead of an empty collapsed row.
  useEffect(() => {
    if (!workspaceFilter) return;
    const key = projectKey(workspaceFilter);
    setCollapsedProjects((current) => {
      if (!current.has(key)) return current;
      const expanded = new Set(current);
      expanded.delete(key);
      return expanded;
    });
  }, [workspaceFilter]);

  // Deep links from the command palette: ?session=<id>&event=<id>
  useEffect(() => {
    if (!sessionParam) return;
    setSelectedId(sessionParam);
    if (eventParam) {
      setFocusEventId(eventParam);
      setDetailView("timeline");
    }
  }, [eventParam, sessionParam]);

  // Auto-selection should land on a session the user can actually see; if every
  // project is collapsed, fall back to the top project's first session so the
  // detail pane still has content.
  const firstAutoSessionId = useMemo(() => {
    const visible = projectGroups.find((group) => !collapsedProjects.has(group.key));
    return visible?.sessions[0]?.id ?? projectGroups[0]?.sessions[0]?.id ?? null;
  }, [collapsedProjects, projectGroups]);

  useEffect(() => {
    if (!selectedId && firstAutoSessionId) setSelectedId(firstAutoSessionId);
  }, [firstAutoSessionId, selectedId]);

  useEffect(() => {
    if (!workspaceFilter && !favoriteOnly) return;
    if (!filteredSessions.some((session) => session.id === selectedId)) {
      setSelectedId(firstAutoSessionId);
    }
  }, [favoriteOnly, filteredSessions, firstAutoSessionId, selectedId, workspaceFilter]);

  function toggleProject(key: string) {
    setCollapsedProjects((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAllProjects() {
    const allCollapsed =
      projectGroups.length > 0 && projectGroups.every((group) => collapsedProjects.has(group.key));
    setCollapsedProjects(
      allCollapsed ? new Set<string>() : new Set(projectGroups.map((group) => group.key)),
    );
  }

  function filterProject(workspace: string) {
    const next = new URLSearchParams(searchParams);
    const active =
      workspaceFilter !== null && projectKey(workspaceFilter) === projectKey(workspace);
    if (active) next.delete("workspace");
    else next.set("workspace", workspace);
    setSearchParams(next, { replace: true });
    setSelectedId(null);
  }

  const selected = useMemo(
    () => sessionModel.sessions.find((session) => session.id === selectedId) ?? null,
    [selectedId, sessionModel.sessions],
  );
  const visibleError =
    sessionModel.error ?? localHistory.error ?? eventModel.error ?? searchModel.error;

  function selectSession(sessionId: string) {
    setSelectedId(sessionId);
    if (sessionParam || eventParam) {
      const next = new URLSearchParams(searchParams);
      next.delete("session");
      next.delete("event");
      setSearchParams(next, { replace: true });
    }
  }

  return (
    <div className="dashboard-page">
      {visibleError ? (
        <div className="error-banner" role="alert">
          {visibleError}
        </div>
      ) : null}

      <header className="dashboard-head">
        <div className="dashboard-heading">
          <span className="eyebrow">LOCAL AGENTS</span>
          <h2>本地 Agent 会话</h2>
          <p>自动读取本地历史，并监听新会话和新增消息。</p>
        </div>
        <div className="source-status-list" aria-label="本地来源状态">
          {localHistory.statuses.map((status) => (
            <SourceStatus key={status.source} status={status} />
          ))}
        </div>
        <button
          className="secondary-button icon-text-button"
          disabled={localHistory.scanning}
          onClick={() => void localHistory.scan()}
          type="button"
        >
          <Icon name="refresh" size={14} />
          {localHistory.scanning ? "正在扫描…" : "重新扫描"}
        </button>
      </header>

      <div className="dashboard-grid">
        <aside className="sidebar">
          <section className="panel session-browser">
            <div className="session-toolbar">
              <div className="session-toolbar-head">
                <label className="session-search">
                  <Icon name="search" size={15} />
                  <input
                    aria-label="全局搜索"
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="搜索消息、命令、工具…"
                    type="search"
                    value={searchQuery}
                  />
                </label>
              </div>

              <div className="session-toolbar-actions">
                <span className="session-count">
                  <b>{filteredSessions.length}</b> 个会话
                  <span className="session-count-divider">·</span>
                  <b>{projectGroups.length}</b> 个项目
                </span>
                <div className="session-toolbar-buttons">
                  <button
                    aria-label={
                      projectGroups.length > 0 &&
                      projectGroups.every((group) => collapsedProjects.has(group.key))
                        ? "展开全部项目"
                        : "收起全部项目"
                    }
                    className="icon-button"
                    onClick={toggleAllProjects}
                    title={
                      projectGroups.length > 0 &&
                      projectGroups.every((group) => collapsedProjects.has(group.key))
                        ? "展开全部项目"
                        : "收起全部项目"
                    }
                    type="button"
                  >
                    <Icon name="fold" size={15} />
                  </button>
                  <button
                    aria-label={
                      sortOrder === "desc"
                        ? "当前按时间倒序，点击切换为时间顺序"
                        : "当前按时间顺序，点击切换为时间倒序"
                    }
                    className="icon-button"
                    onClick={() => setSortOrder((value) => (value === "desc" ? "asc" : "desc"))}
                    title={sortOrder === "desc" ? "时间倒序（最新优先）" : "时间顺序（最早优先）"}
                    type="button"
                  >
                    <Icon name={sortOrder === "desc" ? "sort-desc" : "sort-asc"} size={15} />
                  </button>
                  <button
                    aria-label="只看收藏"
                    aria-pressed={favoriteOnly}
                    className={`icon-button ${favoriteOnly ? "active" : ""}`}
                    onClick={() => {
                      setFavoriteOnly((value) => !value);
                      setSelectedId(null);
                    }}
                    title={favoriteOnly ? "显示全部会话" : "只看收藏"}
                    type="button"
                  >
                    <Icon name={favoriteOnly ? "star-filled" : "star"} size={15} />
                  </button>
                </div>
              </div>

              <div className="source-tabs" role="tablist" aria-label="会话来源">
                {(["all", "codex", "claude", "gemini", "cursor"] as const).map((source) => (
                  <button
                    aria-selected={sourceFilter === source}
                    className={sourceFilter === source ? "active" : ""}
                    key={source}
                    onClick={() => {
                      setSourceFilter(source);
                      setSelectedId(null);
                    }}
                    role="tab"
                    type="button"
                  >
                    {source === "all" ? "全部" : sessionSourceLabels[source]}
                  </button>
                ))}
              </div>

              {workspaceFilter ? (
                <div className="workspace-filter-chip" title={workspaceFilter}>
                  <Icon name="folder" size={13} />
                  <span>{workspaceFilter}</span>
                  <button
                    aria-label="清除项目筛选"
                    onClick={() => {
                      const next = new URLSearchParams(searchParams);
                      next.delete("workspace");
                      setSearchParams(next, { replace: true });
                      setSelectedId(null);
                    }}
                    type="button"
                  >
                    <Icon name="close" size={12} />
                  </button>
                </div>
              ) : null}
            </div>

            {searchModel.active ? (
              <div className="search-results">
                {searchModel.loading ? (
                  <div className="empty-state compact">
                    <span className="spinner" aria-hidden="true" />
                    搜索中…
                  </div>
                ) : null}
                {!searchModel.loading && searchModel.hits.length === 0 ? (
                  <div className="empty-state compact">没有匹配结果</div>
                ) : null}
                {searchModel.hits.map((hit) => (
                  <button
                    className="search-hit"
                    key={`${hit.sessionId}:${hit.eventId ?? hit.matchField}:${hit.snippet}`}
                    onClick={() => {
                      selectSession(hit.sessionId);
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
                        {sessionSourceLabels[hit.source]}
                      </span>
                      {hit.workspace ? <span title={hit.workspace}>{hit.workspace}</span> : null}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <>
                {sessionModel.loading ? (
                  <div className="session-skeleton" aria-hidden="true">
                    {Array.from({ length: 6 }, (_, index) => (
                      <div className="skeleton-row" key={index} />
                    ))}
                  </div>
                ) : null}
                {!sessionModel.loading && filteredSessions.length === 0 ? (
                  <div className="empty-state">
                    <Icon name="sessions" size={22} />
                    <strong>
                      {favoriteOnly
                        ? "还没有收藏的会话"
                        : workspaceFilter
                          ? "该项目下没有可读取的会话"
                          : "这个来源还没有可读取的会话"}
                    </strong>
                    <span>运行一次 Agent 后，返回这里或点击重新扫描。</span>
                  </div>
                ) : null}
                <ProjectSessionTree
                  activeWorkspace={workspaceFilter}
                  collapsed={collapsedProjects}
                  groups={projectGroups}
                  onFilterProject={filterProject}
                  onSelectSession={selectSession}
                  onToggleFavorite={(session) =>
                    void sessionModel.toggleFavorite(session.id, !session.isFavorite)
                  }
                  onToggleProject={toggleProject}
                  selectedId={selectedId}
                />
              </>
            )}
          </section>
        </aside>

        <section className="workspace">
          <div className="panel detail-panel">
            <div className="detail-header">
              <div className="detail-header-main">
                <div className="detail-title-row">
                  <h2>{selected?.name ?? "选择一个本地会话"}</h2>
                  {selected ? (
                    <span className={`source-badge source-${selected.source}`}>
                      {sessionSourceLabels[selected.source]}
                    </span>
                  ) : null}
                </div>
                {selected?.workspace ? (
                  <p className="detail-workspace" title={selected.workspace}>
                    <Icon name="folder" size={13} />
                    {selected.workspace}
                  </p>
                ) : (
                  <p className="detail-workspace muted">
                    {selected ? "本地 Agent 会话记录" : "从左侧项目树选择一个会话开始查看"}
                  </p>
                )}
              </div>
              {selected ? (
                <div className="detail-header-actions">
                  <SessionUsageSummary session={selected} />
                  <button
                    aria-label={selected.isFavorite ? "取消收藏" : "收藏"}
                    aria-pressed={selected.isFavorite}
                    className={`secondary-button icon-text-button ${
                      selected.isFavorite ? "is-favorite" : ""
                    }`}
                    onClick={() =>
                      void sessionModel.toggleFavorite(selected.id, !selected.isFavorite)
                    }
                    type="button"
                  >
                    <Icon name={selected.isFavorite ? "star-filled" : "star"} size={14} />
                    {selected.isFavorite ? "已收藏" : "收藏"}
                  </button>
                </div>
              ) : null}
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
                    <Icon name="insights" size={14} />
                    Agent 统计
                  </button>
                  <button
                    aria-selected={detailView === "timeline"}
                    className={detailView === "timeline" ? "active" : ""}
                    onClick={() => setDetailView("timeline")}
                    role="tab"
                    type="button"
                  >
                    <Icon name="sessions" size={14} />
                    执行流程与事件
                    <span className="tab-count">{eventModel.events.length}</span>
                  </button>
                </div>
                <div className="detail-body">
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
                </div>
              </>
            ) : (
              <div className="empty-state large">
                <Icon name="sessions" size={28} />
                <strong>还没有选择会话</strong>
                <span>扫描完成后，从左侧项目树选择 Codex、Claude、Gemini 或 Cursor 会话。</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
