import type { CaptureSession } from "../../shared/contracts/capture";
import type { ProjectGroup } from "../../entities/session-group/model/groupSessionsByProject";
import {
  formatRelativeTime,
  projectKey,
} from "../../entities/session-group/model/groupSessionsByProject";
import { sessionSourceLabels } from "../../shared/lib/sessionSource";
import { SessionUsageSummary } from "../../entities/session-usage/ui/SessionUsageSummary";
import { Icon } from "../../shared/ui/icons";

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

interface ProjectSessionTreeProps {
  groups: ProjectGroup[];
  selectedId: string | null;
  collapsed: ReadonlySet<string>;
  activeWorkspace: string | null;
  onSelectSession: (sessionId: string) => void;
  onToggleProject: (key: string) => void;
  onToggleFavorite: (session: CaptureSession) => void;
  onFilterProject: (workspace: string) => void;
}

function sourceSummary(group: ProjectGroup): string {
  return group.sources
    .map(({ source, count }) => `${sessionSourceLabels[source]} ${count}`)
    .join(" · ");
}

export function ProjectSessionTree({
  groups,
  selectedId,
  collapsed,
  activeWorkspace,
  onSelectSession,
  onToggleProject,
  onToggleFavorite,
  onFilterProject,
}: ProjectSessionTreeProps) {
  return (
    <nav className="session-tree" aria-label="按项目分组的会话">
      {groups.map((group) => {
        const open = !collapsed.has(group.key);
        const containsSelected = group.sessions.some((session) => session.id === selectedId);
        const workspace = group.workspace;
        const filterActive =
          activeWorkspace !== null &&
          workspace !== null &&
          projectKey(activeWorkspace) === group.key;
        const relative = formatRelativeTime(group.lastUpdatedAt);
        const label =
          `${group.name}，${group.sessionCount} 个会话，` +
          `${sourceSummary(group)}，最近 ${relative}`;
        return (
          <div
            className={`project-node ${containsSelected ? "contains-selected" : ""} ${
              filterActive ? "filter-active" : ""
            }`}
            key={group.key}
          >
            <div className="project-head">
              <button
                aria-expanded={open}
                aria-label={label}
                className="project-toggle"
                onClick={() => onToggleProject(group.key)}
                title={workspace ?? "没有记录工作目录的会话"}
                type="button"
              >
                <Icon className="project-chevron" name="chevron-right" size={13} />
                <span className="project-folder">
                  <Icon name="folder" size={14} />
                </span>
                <span className="project-name">{group.name}</span>
                <span className="project-sources">
                  {group.sources.map(({ source }) => (
                    <span className={`source-dot source-${source}`} key={source} />
                  ))}
                </span>
                <span className="project-count">{group.sessionCount}</span>
                <time className="project-time" dateTime={group.lastUpdatedAt}>
                  {relative}
                </time>
              </button>
              {workspace ? (
                <button
                  aria-label={filterActive ? "清除项目筛选" : "只看此项目"}
                  aria-pressed={filterActive}
                  className={`project-filter ${filterActive ? "active" : ""}`}
                  onClick={() => onFilterProject(workspace)}
                  title={filterActive ? "清除项目筛选" : "只看此项目"}
                  type="button"
                >
                  <Icon name={filterActive ? "close" : "filter"} size={13} />
                </button>
              ) : null}
            </div>

            {open ? (
              <div className="project-sessions" role="group" aria-label={`${group.name} 的会话`}>
                {group.sessions.map((session) => (
                  <div
                    className={`session-item ${session.id === selectedId ? "selected" : ""}`}
                    key={session.id}
                  >
                    <button
                      aria-current={session.id === selectedId ? "true" : undefined}
                      className="session-item-main"
                      onClick={() => onSelectSession(session.id)}
                      type="button"
                    >
                      <div className="session-title">
                        <span
                          className={`source-dot source-${session.source}`}
                          aria-hidden="true"
                        />
                        <span className="session-name">{session.name}</span>
                        {group.sources.length > 1 ? (
                          <span className={`source-badge source-${session.source}`}>
                            {sessionSourceLabels[session.source]}
                          </span>
                        ) : null}
                      </div>
                      <div className="session-meta">
                        <time dateTime={session.updatedAt}>
                          {dateFormatter.format(new Date(session.updatedAt))}
                        </time>
                        <span>·</span>
                        <span>{session.lastSequence} 个事件</span>
                      </div>
                      <SessionUsageSummary compact session={session} />
                    </button>
                    <button
                      aria-label={session.isFavorite ? "取消收藏" : "收藏"}
                      className={`session-favorite ${session.isFavorite ? "active" : ""}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleFavorite(session);
                      }}
                      type="button"
                    >
                      <Icon name={session.isFavorite ? "star-filled" : "star"} size={15} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
