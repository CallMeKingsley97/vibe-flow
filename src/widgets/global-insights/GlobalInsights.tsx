import { useMemo } from "react";

import {
  formatBucketLabel,
  formatCount,
  isEmpty,
  maxBucketValue,
  sourceLabels,
  type InsightRange,
} from "../../entities/global-insights/model/formatInsights";
import type {
  GlobalInsights,
  SessionSource,
  TimeBucketPoint,
} from "../../shared/contracts/capture";

interface GlobalInsightsProps {
  data: GlobalInsights | null;
  loading: boolean;
  error: string | null;
  range: InsightRange;
  bucket: "day" | "week";
  source: SessionSource | "all";
  workspace: string | null;
  onRangeChange: (range: InsightRange) => void;
  onBucketChange: (bucket: "day" | "week") => void;
  onSourceChange: (source: SessionSource | "all") => void;
  onProjectClick?: (workspace: string) => void;
  onRefresh: () => void;
}

const rangeOptions: Array<{ value: InsightRange; label: string }> = [
  { value: "7d", label: "最近 7 天" },
  { value: "30d", label: "最近 30 天" },
  { value: "90d", label: "最近 90 天" },
];

const sourceOptions: Array<{ value: SessionSource | "all"; label: string }> = [
  { value: "all", label: "全部" },
  { value: "codex", label: "Codex" },
  { value: "claude", label: "Claude" },
  { value: "gemini", label: "Gemini" },
  { value: "cursor", label: "Cursor" },
];

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
});

function TrendChart({ points, bucket }: { points: TimeBucketPoint[]; bucket: "day" | "week" }) {
  const max = Math.max(1, maxBucketValue(points, "sessions"));
  if (!points.length) {
    return <div className="insights-empty">当前范围内还没有可视化的数据。</div>;
  }
  return (
    <div className="insights-trend" aria-label={`${bucket === "day" ? "按日" : "按周"}趋势`}>
      {points.map((point) => {
        const height = Math.max(6, Math.round((point.sessions / max) * 96));
        return (
          <div
            className={`insights-trend-bar${point.errors ? " has-error" : ""}`}
            key={point.bucket}
            title={`${formatBucketLabel(point.bucket)} · ${point.sessions} 会话 · ${point.errors} 错误`}
          >
            <span style={{ height: `${height}px` }} />
            <em>{formatBucketLabel(point.bucket)}</em>
          </div>
        );
      })}
    </div>
  );
}

function SourceCompareRow({
  label,
  sessions,
  errors,
  tokens,
  maxSessions,
  metaExtra,
}: {
  label: string;
  sessions: number;
  errors: number;
  tokens: number;
  maxSessions: number;
  metaExtra?: string;
}) {
  const ratio = Math.max(2, Math.min(100, Math.round((sessions / (maxSessions || 1)) * 100)));
  return (
    <div className="insights-compare-row">
      <span className="insights-compare-label" title={label}>
        {label}
      </span>
      <i className="insights-compare-track">
        <b style={{ width: `${ratio}%` }} />
      </i>
      <span className="insights-compare-meta">
        <strong>{sessions}</strong>
        <em>{errors ? `${errors} 错误` : "无错误"}</em>
        {metaExtra ? <em>{metaExtra}</em> : null}
        <em>{tokens ? `${formatCount(tokens)} tokens` : "—"}</em>
      </span>
    </div>
  );
}

function InsightsControls({
  range,
  bucket,
  source,
  onRangeChange,
  onBucketChange,
  onSourceChange,
  onRefresh,
}: {
  range: InsightRange;
  bucket: "day" | "week";
  source: SessionSource | "all";
  onRangeChange: (range: InsightRange) => void;
  onBucketChange: (bucket: "day" | "week") => void;
  onSourceChange: (source: SessionSource | "all") => void;
  onRefresh: () => void;
}) {
  return (
    <div className="insights-controls">
      <div className="insights-segment" role="tablist" aria-label="时间范围">
        {rangeOptions.map((option) => (
          <button
            aria-selected={range === option.value}
            className={range === option.value ? "active" : ""}
            key={option.value}
            onClick={() => onRangeChange(option.value)}
            role="tab"
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="insights-segment" role="tablist" aria-label="Agent 来源">
        {sourceOptions.map((option) => (
          <button
            aria-selected={source === option.value}
            className={source === option.value ? "active" : ""}
            key={option.value}
            onClick={() => onSourceChange(option.value)}
            role="tab"
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="insights-segment" role="tablist" aria-label="桶粒度">
        <button
          aria-selected={bucket === "day"}
          className={bucket === "day" ? "active" : ""}
          onClick={() => onBucketChange("day")}
          role="tab"
          type="button"
        >
          按日
        </button>
        <button
          aria-selected={bucket === "week"}
          className={bucket === "week" ? "active" : ""}
          onClick={() => onBucketChange("week")}
          role="tab"
          type="button"
        >
          按周
        </button>
      </div>
      <button className="insights-refresh" onClick={onRefresh} type="button">
        刷新
      </button>
    </div>
  );
}

export function GlobalInsightsView({
  data,
  loading,
  error,
  range,
  bucket,
  source,
  onRangeChange,
  onBucketChange,
  onSourceChange,
  onProjectClick,
  onRefresh,
}: GlobalInsightsProps) {
  const maxSourceSessions = useMemo(
    () => Math.max(1, ...(data?.bySource.map((item) => item.sessions) ?? [1])),
    [data],
  );
  const maxProviderSessions = useMemo(
    () => Math.max(1, ...(data?.byProvider.map((item) => item.sessions) ?? [1])),
    [data],
  );
  const maxBaseUrlSessions = useMemo(
    () => Math.max(1, ...(data?.byBaseUrl.map((item) => item.sessions) ?? [1])),
    [data],
  );

  const controls = (
    <InsightsControls
      bucket={bucket}
      onBucketChange={onBucketChange}
      onRangeChange={onRangeChange}
      onRefresh={onRefresh}
      onSourceChange={onSourceChange}
      range={range}
      source={source}
    />
  );

  if (loading && !data) {
    return (
      <section className="insights-page">
        <header className="insights-hero">
          <div className="insights-hero-copy">
            <span className="eyebrow">GLOBAL INSIGHTS</span>
            <h2>跨 Agent 洞察</h2>
            <p>汇总 Codex、Claude、Gemini 和 Cursor 的本地会话；仅统计已保存的本地历史。</p>
          </div>
        </header>
        {controls}
        <div className="insights-loading">正在计算跨会话洞察…</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="insights-page">
        <header className="insights-hero">
          <div className="insights-hero-copy">
            <span className="eyebrow">GLOBAL INSIGHTS</span>
            <h2>跨 Agent 洞察</h2>
            <p>汇总 Codex、Claude、Gemini 和 Cursor 的本地会话；仅统计已保存的本地历史。</p>
          </div>
        </header>
        {controls}
        <div className="insights-error" role="alert">
          {error}
        </div>
      </section>
    );
  }

  if (!data || isEmpty(data)) {
    const filteredSource = source !== "all" ? sourceLabels[source] : null;
    return (
      <section className="insights-page">
        <header className="insights-hero">
          <div className="insights-hero-copy">
            <span className="eyebrow">GLOBAL INSIGHTS</span>
            <h2>还没有可以聚合的数据</h2>
            <p>
              {filteredSource
                ? `当前筛选「${filteredSource}」在所选时间范围内没有会话。可切换到「全部」或其他 Agent，或扩大时间范围。`
                : "打开 Codex、Claude、Gemini 或 Cursor 使用几次后，回到这里就能看到跨会话的执行洞察。"}
            </p>
          </div>
        </header>
        {controls}
        {filteredSource ? (
          <div className="insights-empty-actions">
            <button
              className="insights-reset-filter"
              onClick={() => onSourceChange("all")}
              type="button"
            >
              返回全部 Agent
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  const totals = data.totals;
  const metricTiles: Array<{ label: string; value: string; hint?: string }> = [
    { label: "会话", value: totals.sessions.toString() },
    { label: "事件", value: formatCount(totals.events) },
    { label: "工具调用", value: formatCount(totals.toolCalls) },
    { label: "命令", value: formatCount(totals.commands) },
    { label: "文件操作", value: formatCount(totals.fileChanges) },
    totals.errors
      ? { label: "错误", value: totals.errors.toString(), hint: "点击错误列查看" }
      : { label: "错误", value: "0" },
  ];

  return (
    <section className="insights-page">
      <header className="insights-hero">
        <div className="insights-hero-copy">
          <span className="eyebrow">GLOBAL INSIGHTS</span>
          <h2>跨 Agent 洞察</h2>
          <p>汇总 Codex、Claude、Gemini 和 Cursor 的本地会话；仅统计已保存的本地历史。</p>
        </div>
        <div className="insights-hero-summary">
          <strong>{totals.sessions}</strong>
          <small>
            会话数 · {dateFormatter.format(new Date(data.from))} ~{" "}
            {dateFormatter.format(new Date(data.to))}
          </small>
        </div>
      </header>

      {controls}

      <div className="insights-grid">
        <div className="insights-metric-grid">
          {metricTiles.map((tile) => (
            <div className="insights-metric" key={tile.label}>
              <span>{tile.label}</span>
              <strong>{tile.value}</strong>
              {tile.hint ? <em>{tile.hint}</em> : null}
            </div>
          ))}
        </div>

        <section className="insights-card">
          <header>
            <div>
              <span className="eyebrow">AGENT COMPARE</span>
              <h3>Agent 对比</h3>
            </div>
          </header>
          {data.bySource.length ? (
            <div className="insights-compare">
              {data.bySource.map((item) => (
                <SourceCompareRow
                  key={item.source}
                  label={sourceLabels[item.source]}
                  sessions={item.sessions}
                  errors={item.errors}
                  tokens={item.totalTokens}
                  maxSessions={maxSourceSessions}
                />
              ))}
            </div>
          ) : (
            <div className="insights-empty">当前范围内没有匹配的 Agent 数据。</div>
          )}
        </section>

        <section className="insights-card">
          <header>
            <div>
              <span className="eyebrow">MODEL COMPARE</span>
              <h3>模型对比</h3>
            </div>
            <small>按会话模型名聚合 · 看错误与用量</small>
          </header>
          {data.byProvider.length ? (
            <div className="insights-compare">
              {data.byProvider.map((item) => {
                const errorRate =
                  item.sessions > 0 ? Math.round((item.errors / item.sessions) * 10) / 10 : 0;
                return item.sessions ? (
                  <SourceCompareRow
                    key={item.provider}
                    label={item.provider}
                    sessions={item.sessions}
                    errors={item.errors}
                    tokens={item.totalTokens}
                    maxSessions={maxProviderSessions}
                    metaExtra={`${errorRate} 错/会话`}
                  />
                ) : (
                  <SourceCompareRow
                    key={item.provider}
                    label={item.provider}
                    sessions={item.sessions}
                    errors={item.errors}
                    tokens={item.totalTokens}
                    maxSessions={maxProviderSessions}
                  />
                );
              })}
            </div>
          ) : (
            <div className="insights-empty">当前范围内没有可识别的模型数据。</div>
          )}
        </section>

        <section className="insights-card">
          <header>
            <div>
              <span className="eyebrow">BASE URL COMPARE</span>
              <h3>API 提供商对比</h3>
            </div>
            <small>按 base_url 聚合 · 模型背后的 API 端点</small>
          </header>
          {data.byBaseUrl.length ? (
            <div className="insights-compare">
              {data.byBaseUrl.map((item) => {
                const errorRate =
                  item.sessions > 0 ? Math.round((item.errors / item.sessions) * 10) / 10 : 0;
                return item.sessions ? (
                  <SourceCompareRow
                    key={item.baseUrl}
                    label={item.baseUrl}
                    sessions={item.sessions}
                    errors={item.errors}
                    tokens={item.totalTokens}
                    maxSessions={maxBaseUrlSessions}
                    metaExtra={`${errorRate} 错/会话`}
                  />
                ) : (
                  <SourceCompareRow
                    key={item.baseUrl}
                    label={item.baseUrl}
                    sessions={item.sessions}
                    errors={item.errors}
                    tokens={item.totalTokens}
                    maxSessions={maxBaseUrlSessions}
                  />
                );
              })}
            </div>
          ) : (
            <div className="insights-empty">当前范围内没有可识别的 base_url 提供商数据。</div>
          )}
        </section>

        <section className="insights-card">
          <header>
            <div>
              <span className="eyebrow">TIMELINE</span>
              <h3>时间趋势</h3>
            </div>
            <small>
              {bucket === "day" ? "按日" : "按周"} · {data.timeline.length} 桶
            </small>
          </header>
          <TrendChart points={data.timeline} bucket={bucket} />
        </section>

        <section className="insights-card">
          <header>
            <div>
              <span className="eyebrow">TOP PROJECTS</span>
              <h3>项目对比</h3>
            </div>
            <small>点击进入 Dashboard 并过滤</small>
          </header>
          {data.byProject.length ? (
            <div className="insights-project-list">
              {data.byProject.map((project) => (
                <button
                  className="insights-project"
                  key={project.workspace}
                  onClick={() => onProjectClick?.(project.workspace)}
                  type="button"
                >
                  <span className="insights-project-title" title={project.workspace}>
                    {project.workspace}
                  </span>
                  <span className="insights-project-meta">
                    <strong>{project.sessions}</strong>
                    <em>{project.events} 事件</em>
                    <em>{project.errors ? `${project.errors} 错误` : "无错误"}</em>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="insights-empty">当前范围内没有可展示的项目。</div>
          )}
        </section>

        <section className="insights-card insights-ranking-card">
          <header>
            <div>
              <span className="eyebrow">RANKINGS</span>
              <h3>使用排行</h3>
            </div>
          </header>
          <div className="insights-ranking-grid">
            <Ranking title="常用工具" items={data.topTools} empty="没有工具调用" />
            <Ranking title="Skill" items={data.topSkills} empty="没有识别到 Skill" />
            <Ranking title="MCP 服务" items={data.topMcp} empty="没有识别到 MCP" />
          </div>
        </section>
      </div>
    </section>
  );
}

function Ranking({
  title,
  items,
  empty,
}: {
  title: string;
  items: Array<{ name: string; count: number }>;
  empty: string;
}) {
  const max = items[0]?.count ?? 1;
  return (
    <div className="insights-ranking">
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
    </div>
  );
}
