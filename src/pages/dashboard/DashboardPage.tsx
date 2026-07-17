import { useEffect, useMemo, useState } from "react";

import { useCaptureSessions } from "../../features/capture-session/model/useCaptureSessions";
import { useSessionEvents } from "../../features/capture-session/model/useSessionEvents";
import { useLocalHistory } from "../../features/local-history/model/useLocalHistory";
import { SessionUsageSummary } from "../../entities/session-usage/ui/SessionUsageSummary";
import type {
  CaptureSession,
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

type SourceFilter = "all" | SessionSource;

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

export function DashboardPage() {
  const sessionModel = useCaptureSessions();
  const refreshSessions = sessionModel.refresh;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const localHistory = useLocalHistory(refreshSessions, selectedId);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const eventModel = useSessionEvents(selectedId, localHistory.revision);
  const [detailView, setDetailView] = useState<"insights" | "timeline">("insights");
  const [focusEventId, setFocusEventId] = useState<string | null>(null);

  const filteredSessions = useMemo(
    () =>
      sourceFilter === "all"
        ? sessionModel.sessions
        : sessionModel.sessions.filter((session) => session.source === sourceFilter),
    [sessionModel.sessions, sourceFilter],
  );

  useEffect(() => {
    if (!selectedId && filteredSessions[0]) setSelectedId(filteredSessions[0].id);
  }, [filteredSessions, selectedId]);

  const selected = useMemo(
    () => sessionModel.sessions.find((session) => session.id === selectedId) ?? null,
    [selectedId, sessionModel.sessions],
  );
  const visibleError = sessionModel.error ?? localHistory.error ?? eventModel.error;

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
            {sessionModel.loading ? <div className="empty-state">正在加载…</div> : null}
            {!sessionModel.loading && filteredSessions.length === 0 ? (
              <div className="empty-state">这个来源还没有可读取的会话</div>
            ) : null}
            <div className="session-list">
              {filteredSessions.map((session: CaptureSession) => (
                <button
                  className={`session-item ${session.id === selectedId ? "selected" : ""}`}
                  key={session.id}
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
              ))}
            </div>
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
