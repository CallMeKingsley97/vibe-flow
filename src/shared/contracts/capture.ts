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

export const CaptureSessionSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(80),
  status: SessionStatusSchema,
  startedAt: z.iso.datetime({ offset: true }),
  endedAt: z.iso.datetime({ offset: true }).nullable(),
  lastSequence: z.number().int().nonnegative(),
  source: SessionSourceSchema,
  externalId: z.string().nullable(),
  sourcePath: z.string().nullable(),
  workspace: z.string().nullable(),
  model: z.string().nullable(),
  reasoningEffort: z.string().nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  cachedInputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  reasoningOutputTokens: z.number().int().nonnegative().nullable(),
  totalTokens: z.number().int().nonnegative().nullable(),
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
