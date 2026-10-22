import type { CaptureSession, SessionSource } from "../../../shared/contracts/capture";

export const UNASSIGNED_PROJECT_KEY = "__unassigned__";

export type SessionSortOrder = "desc" | "asc";

export interface ProjectSourceCount {
  source: SessionSource;
  count: number;
}

export interface ProjectGroup {
  /** Workspace path, or the unassigned sentinel for sessions without one. */
  key: string;
  workspace: string | null;
  name: string;
  sessions: CaptureSession[];
  sources: ProjectSourceCount[];
  sessionCount: number;
  favoriteCount: number;
  lastUpdatedAt: string;
}

const sourceOrder: SessionSource[] = ["codex", "claude", "gemini", "cursor"];

/** Last path segment, which is the name developers recognize as the project. */
export function projectDisplayName(workspace: string | null | undefined): string {
  if (!workspace) return "未关联项目";
  const trimmed = workspace.replace(/[\\/]+$/, "");
  if (!trimmed) return workspace;
  const segments = trimmed.split(/[\\/]/);
  return segments[segments.length - 1] ?? trimmed;
}

/** Two path segments keep same-named projects distinguishable. */
function qualifiedProjectName(workspace: string): string {
  const segments = workspace.replace(/[\\/]+$/, "").split(/[\\/]/);
  return segments.slice(-2).join("/");
}

function sessionTime(session: CaptureSession): number {
  const parsed = Date.parse(session.updatedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Picks the most common raw spelling for a project so an "only this project"
 * filter matches as many stored sessions as possible.
 */
function representativeWorkspace(rawForms: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of rawForms) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function normalizeWorkspace(workspace: string | null): string | null {
  if (!workspace) return null;
  const trimmed = workspace.trim();
  if (!trimmed) return null;
  const stripped = trimmed.replace(/[\\/]+$/, "");
  // A bare root path ("/" or "C:\") is still a real project; anything that
  // collapses to nothing after trimming separators is not.
  if (!stripped) return /^[\\/]+$/.test(trimmed) ? trimmed.charAt(0) : null;
  return stripped;
}

/**
 * Normalizes a workspace the same way for grouping and deep links so a
 * selected session always maps back to its project group.
 */
export function projectKey(workspace: string | null | undefined): string {
  return normalizeWorkspace(workspace ?? null) ?? UNASSIGNED_PROJECT_KEY;
}

type Bucket = {
  /** Raw workspace spellings, so the project filter matches the most rows. */
  rawForms: Map<string, number>;
  sessions: CaptureSession[];
};

/**
 * Groups sessions by their workspace directory. Sessions without a workspace
 * stay in a trailing "未关联项目" bucket. Both project order and the order of
 * sessions inside each project follow `sortOrder`; projects are ranked by their
 * most recent activity.
 */
export function groupSessionsByProject(
  sessions: CaptureSession[],
  sortOrder: SessionSortOrder = "desc",
): ProjectGroup[] {
  const direction = sortOrder === "desc" ? -1 : 1;
  const buckets = new Map<string, Bucket>();

  for (const session of sessions) {
    // Keep the workspace exactly as recorded so backend filters (which use
    // exact string matching) still find these sessions; only whitespace-only
    // values count as unassigned.
    const raw = session.workspace && session.workspace.trim() ? session.workspace : null;
    const key = normalizeWorkspace(raw) ?? UNASSIGNED_PROJECT_KEY;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.sessions.push(session);
      if (raw) bucket.rawForms.set(raw, (bucket.rawForms.get(raw) ?? 0) + 1);
    } else {
      const rawForms = new Map<string, number>();
      if (raw) rawForms.set(raw, 1);
      buckets.set(key, { rawForms, sessions: [session] });
    }
  }

  const groups: ProjectGroup[] = [];
  for (const [key, bucket] of buckets) {
    bucket.sessions.sort((left, right) => {
      const delta = sessionTime(left) - sessionTime(right);
      // Ties stay alphabetical regardless of the time direction so equal
      // timestamps never shuffle unpredictably when the user flips the sort.
      if (delta === 0) return left.name.localeCompare(right.name, "zh-CN");
      return delta * direction;
    });

    const counts = new Map<SessionSource, number>();
    let favoriteCount = 0;
    let latest = 0;
    for (const session of bucket.sessions) {
      counts.set(session.source, (counts.get(session.source) ?? 0) + 1);
      if (session.isFavorite) favoriteCount += 1;
      latest = Math.max(latest, sessionTime(session));
    }

    const workspace = representativeWorkspace(bucket.rawForms);
    groups.push({
      key,
      workspace,
      name: projectDisplayName(workspace),
      sessions: bucket.sessions,
      sources: sourceOrder
        .filter((source) => counts.has(source))
        .map((source) => ({ source, count: counts.get(source) ?? 0 })),
      sessionCount: bucket.sessions.length,
      favoriteCount,
      lastUpdatedAt: new Date(latest).toISOString(),
    });
  }

  groups.sort((left, right) => {
    // Sessions without a workspace are the least actionable, keep them last
    // regardless of the sort direction.
    if (left.workspace === null && right.workspace === null) {
      return left.name.localeCompare(right.name, "zh-CN");
    }
    if (left.workspace === null) return 1;
    if (right.workspace === null) return -1;
    const delta = Date.parse(left.lastUpdatedAt) - Date.parse(right.lastUpdatedAt);
    if (delta === 0) return left.name.localeCompare(right.name, "zh-CN");
    return delta * direction;
  });

  // Project folders often share a leaf name (two `vibe-flow` checkouts). Show
  // one extra path segment so the headers stay unambiguous.
  const duplicated = new Map<string, number>();
  for (const group of groups) {
    duplicated.set(group.name, (duplicated.get(group.name) ?? 0) + 1);
  }
  for (const group of groups) {
    if (group.workspace && (duplicated.get(group.name) ?? 0) > 1) {
      group.name = qualifiedProjectName(group.workspace.trim());
    }
  }

  return groups;
}

const shortDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
});

/** Compact recency label for project headers: 刚刚 / 12 分钟前 / 10/18. */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "—";
  const minutes = Math.floor((now - time) / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  return shortDateFormatter.format(new Date(time));
}
