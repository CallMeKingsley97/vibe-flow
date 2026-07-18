import type {
  GlobalInsights,
  SessionSource,
  TimeBucketPoint,
} from "../../../shared/contracts/capture";

export type InsightRange = "7d" | "30d" | "90d" | "custom";

export const sourceLabels: Record<SessionSource, string> = {
  codex: "Codex",
  claude: "Claude",
  gemini: "Gemini",
  cursor: "Cursor",
};

export function rangeWindow(range: InsightRange, now = new Date()): { from: string; to: string } {
  const to = now;
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function formatBucketLabel(bucket: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(bucket)) {
    const parts = bucket.split("-");
    return `${parts[1]}/${parts[2]}`;
  }
  return bucket.replace(/^(\d{4})-W(\d{2})$/, "第 $2 周");
}

export function formatCount(value: number): string {
  if (value < 1000) return value.toString();
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}K`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

export function fillTimeline(points: TimeBucketPoint[]): TimeBucketPoint[] {
  return points.map((point) => ({ ...point }));
}

export function isEmpty(insights: GlobalInsights): boolean {
  return insights.totals.sessions === 0 && insights.totals.events === 0;
}

export function maxBucketValue(points: TimeBucketPoint[], key: keyof TimeBucketPoint): number {
  return points.reduce((max, point) => {
    const value = point[key];
    return typeof value === "number" && value > max ? value : max;
  }, 0);
}
