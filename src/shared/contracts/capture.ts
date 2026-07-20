import { z } from "zod";

export const SessionStatusSchema = z.literal("stopped");
export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export const SessionSourceSchema = z.enum(["codex", "claude", "gemini", "cursor"]);
export type SessionSource = z.infer<typeof SessionSourceSchema>;

export const HealthCheckSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
  database: z.literal("connected"),
  recoveredDatabasePath: z.string().nullable(),
});
export type HealthCheck = z.infer<typeof HealthCheckSchema>;

export const UpdateCheckSchema = z.object({
  currentVersion: z.string(),
  available: z.boolean(),
  version: z.string().nullable(),
  body: z.string().nullable(),
});
export type UpdateCheck = z.infer<typeof UpdateCheckSchema>;

const SessionNameSchema = z
  .string()
  .min(1)
  // 与 Rust `char` 的计数语义保持一致，避免 emoji 被 UTF-16 代理对重复计数。
  .refine((value) => Array.from(value).length <= 80, {
    message: "会话名称不能超过 80 个 Unicode 字符",
  });

export const CaptureSessionSchema = z.object({
  id: z.uuid(),
  name: SessionNameSchema,
  status: SessionStatusSchema,
  startedAt: z.iso.datetime({ offset: true }),
  endedAt: z.iso.datetime({ offset: true }).nullable(),
  lastSequence: z.number().int().nonnegative(),
  source: SessionSourceSchema,
  externalId: z.string().nullable(),
  sourcePath: z.string().nullable(),
  workspace: z.string().nullable(),
  model: z.string().nullable(),
  baseUrl: z.string().nullable(),
  reasoningEffort: z.string().nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  cachedInputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  reasoningOutputTokens: z.number().int().nonnegative().nullable(),
  totalTokens: z.number().int().nonnegative().nullable(),
  isFavorite: z.boolean(),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type CaptureSession = z.infer<typeof CaptureSessionSchema>;

export const AgentEventSchema = z.object({
  id: z.uuid(),
  sessionId: z.uuid(),
  sequence: z.number().int().positive(),
  timestamp: z.iso.datetime({ offset: true }),
  source: z.enum(["system", "agent", "user", "tool"]),
  kind: z.enum([
    "message",
    "reasoning",
    "llm_usage",
    "tool_call",
    "tool_result",
    "command",
    "file_change",
  ]),
  level: z.enum(["info", "warning", "error"]),
  summary: z.string(),
  payload: z.record(z.string(), z.unknown()),
});
export type AgentEvent = z.infer<typeof AgentEventSchema>;

export const SourceScanStatusSchema = z.object({
  source: SessionSourceSchema,
  detected: z.boolean(),
  sessionCount: z.number().int().nonnegative(),
  lastScanAt: z.iso.datetime({ offset: true }).nullable(),
  error: z.string().nullable(),
});
export type SourceScanStatus = z.infer<typeof SourceScanStatusSchema>;

export const HistoryChangeSchema = z.object({
  source: SessionSourceSchema,
  sessionId: z.uuid(),
});
export type HistoryChange = z.infer<typeof HistoryChangeSchema>;

export const DataSettingsSchema = z.object({
  retentionDays: z.number().int().min(1).max(3650),
  autoCleanup: z.boolean(),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type DataSettings = z.infer<typeof DataSettingsSchema>;
export type UpdateDataSettings = Omit<DataSettings, "updatedAt">;

export const StorageStatsSchema = z.object({
  databaseBytes: z.number().int().nonnegative(),
  sessionCount: z.number().int().nonnegative(),
  eventCount: z.number().int().nonnegative(),
  oldestSessionAt: z.iso.datetime({ offset: true }).nullable(),
});
export type StorageStats = z.infer<typeof StorageStatsSchema>;

export const CleanupPreviewSchema = z.object({
  cutoff: z.iso.datetime({ offset: true }),
  sessionCount: z.number().int().nonnegative(),
  eventCount: z.number().int().nonnegative(),
});
export type CleanupPreview = z.infer<typeof CleanupPreviewSchema>;

export const CleanupResultSchema = z.object({
  deletedSessions: z.number().int().nonnegative(),
  reclaimedDatabaseBytes: z.number().int().nonnegative(),
});
export type CleanupResult = z.infer<typeof CleanupResultSchema>;

export const TimeBucketSchema = z.enum(["day", "week"]);
export type TimeBucket = z.infer<typeof TimeBucketSchema>;

export const InsightsRangeSchema = z.enum(["7d", "30d", "90d", "180d"]);
export type InsightsRange = z.infer<typeof InsightsRangeSchema>;

export const TotalMetricsSchema = z.object({
  sessions: z.number().int().nonnegative(),
  events: z.number().int().nonnegative(),
  userMessages: z.number().int().nonnegative(),
  agentMessages: z.number().int().nonnegative(),
  toolCalls: z.number().int().nonnegative(),
  commands: z.number().int().nonnegative(),
  fileChanges: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});
export type TotalMetrics = z.infer<typeof TotalMetricsSchema>;

export const SourceInsightSchema = z.object({
  source: SessionSourceSchema,
  sessions: z.number().int().nonnegative(),
  events: z.number().int().nonnegative(),
  toolCalls: z.number().int().nonnegative(),
  commands: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});
export type SourceInsight = z.infer<typeof SourceInsightSchema>;

export const ProviderInsightSchema = z.object({
  provider: z.string(),
  sessions: z.number().int().nonnegative(),
  events: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});
export type ProviderInsight = z.infer<typeof ProviderInsightSchema>;

export const BaseUrlInsightSchema = z.object({
  baseUrl: z.string(),
  sessions: z.number().int().nonnegative(),
  events: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});
export type BaseUrlInsight = z.infer<typeof BaseUrlInsightSchema>;

export const ProjectInsightSchema = z.object({
  workspace: z.string(),
  sessions: z.number().int().nonnegative(),
  events: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  lastActiveAt: z.iso.datetime({ offset: true }),
});
export type ProjectInsight = z.infer<typeof ProjectInsightSchema>;

export const TimeBucketPointSchema = z.object({
  bucket: z.string(),
  sessions: z.number().int().nonnegative(),
  events: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
});
export type TimeBucketPoint = z.infer<typeof TimeBucketPointSchema>;

export const RankedItemSchema = z.object({
  name: z.string(),
  count: z.number().int().nonnegative(),
});
export type RankedItem = z.infer<typeof RankedItemSchema>;

export const GlobalInsightsSchema = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  totals: TotalMetricsSchema,
  bySource: z.array(SourceInsightSchema),
  byProvider: z.array(ProviderInsightSchema),
  byBaseUrl: z.array(BaseUrlInsightSchema),
  byProject: z.array(ProjectInsightSchema),
  timeline: z.array(TimeBucketPointSchema),
  topTools: z.array(RankedItemSchema),
  topSkills: z.array(RankedItemSchema),
  topMcp: z.array(RankedItemSchema),
});
export type GlobalInsights = z.infer<typeof GlobalInsightsSchema>;

export interface GlobalInsightsQuery {
  source?: SessionSource;
  workspace?: string;
  from?: string;
  to?: string;
  bucket?: TimeBucket;
  projectLimit?: number;
  rankingLimit?: number;
}

export const SearchScopeSchema = z.enum([
  "all",
  "messages",
  "commands",
  "tools",
  "skills",
  "mcp",
  "sessions",
]);
export type SearchScope = z.infer<typeof SearchScopeSchema>;

export const SearchMatchFieldSchema = z.enum([
  "session_name",
  "workspace",
  "summary",
  "tool_name",
  "skill",
  "mcp",
  "command",
]);
export type SearchMatchField = z.infer<typeof SearchMatchFieldSchema>;

export const SearchHitSchema = z.object({
  sessionId: z.uuid(),
  sessionName: z.string(),
  source: SessionSourceSchema,
  workspace: z.string().nullable(),
  updatedAt: z.iso.datetime({ offset: true }),
  eventId: z.uuid().nullable(),
  sequence: z.number().int().nonnegative().nullable(),
  kind: z
    .enum([
      "message",
      "reasoning",
      "llm_usage",
      "tool_call",
      "tool_result",
      "command",
      "file_change",
    ])
    .nullable(),
  timestamp: z.iso.datetime({ offset: true }).nullable(),
  matchField: SearchMatchFieldSchema,
  snippet: z.string(),
});
export type SearchHit = z.infer<typeof SearchHitSchema>;

export const SearchResultSchema = z.object({
  hits: z.array(SearchHitSchema),
  hasMore: z.boolean(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

export interface SearchAgentHistoryQuery {
  query: string;
  source?: SessionSource;
  workspace?: string;
  scope?: SearchScope;
  limit?: number;
  offset?: number;
}
