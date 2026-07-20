import { Channel, invoke } from "@tauri-apps/api/core";

import { z } from "zod";

import {
  AgentEventSchema,
  CleanupPreviewSchema,
  CleanupResultSchema,
  CaptureSessionSchema,
  DataSettingsSchema,
  GlobalInsightsSchema,
  HealthCheckSchema,
  HistoryChangeSchema,
  SearchResultSchema,
  SourceScanStatusSchema,
  StorageStatsSchema,
  UpdateCheckSchema,
  type AgentEvent,
  type CleanupPreview,
  type CleanupResult,
  type CaptureSession,
  type DataSettings,
  type GlobalInsights,
  type GlobalInsightsQuery,
  type HealthCheck,
  type HistoryChange,
  type SearchAgentHistoryQuery,
  type SearchResult,
  type SourceScanStatus,
  type StorageStats,
  type UpdateCheck,
  type UpdateDataSettings,
} from "../contracts/capture";

export async function healthCheck(): Promise<HealthCheck> {
  return HealthCheckSchema.parse(await invoke<unknown>("health_check"));
}

export async function checkForUpdate(): Promise<UpdateCheck> {
  return UpdateCheckSchema.parse(await invoke<unknown>("check_for_update"));
}

export function installAvailableUpdate(): Promise<boolean> {
  return invoke<boolean>("install_available_update");
}

export async function listCaptureSessions(
  limit = 500,
  offset = 0,
  source?: CaptureSession["source"],
  favoriteOnly = false,
): Promise<CaptureSession[]> {
  return z.array(CaptureSessionSchema).parse(
    await invoke<unknown>("list_capture_sessions", {
      limit,
      offset,
      source: source ?? null,
      favoriteOnly,
    }),
  );
}

export async function setSessionFavorite(
  sessionId: string,
  favorite: boolean,
): Promise<CaptureSession> {
  return CaptureSessionSchema.parse(
    await invoke<unknown>("set_session_favorite", { sessionId, favorite }),
  );
}

export async function searchAgentHistory(
  query: SearchAgentHistoryQuery,
): Promise<SearchResult> {
  return SearchResultSchema.parse(
    await invoke<unknown>("search_agent_history", {
      query: query.query,
      source: query.source ?? null,
      workspace: query.workspace ?? null,
      scope: query.scope ?? null,
      limit: query.limit ?? null,
      offset: query.offset ?? null,
    }),
  );
}

export async function listAgentEvents(
  sessionId: string,
  afterSequence = 0,
  limit = 500,
): Promise<AgentEvent[]> {
  return z
    .array(AgentEventSchema)
    .parse(await invoke<unknown>("list_agent_events", { sessionId, afterSequence, limit }));
}

export async function scanLocalHistory(): Promise<SourceScanStatus[]> {
  return z.array(SourceScanStatusSchema).parse(await invoke<unknown>("scan_local_history"));
}

export async function getSourceScanStatuses(): Promise<SourceScanStatus[]> {
  return z.array(SourceScanStatusSchema).parse(await invoke<unknown>("get_source_scan_statuses"));
}

export async function subscribeHistoryChanges(
  onChange: (change: HistoryChange) => void,
): Promise<void> {
  const channel = new Channel<unknown>();
  channel.onmessage = (message) => onChange(HistoryChangeSchema.parse(message));
  await invoke<void>("subscribe_history_changes", { onChange: channel });
}

export async function getDataSettings(): Promise<DataSettings> {
  return DataSettingsSchema.parse(await invoke<unknown>("get_data_settings"));
}

export async function updateDataSettings(settings: UpdateDataSettings): Promise<DataSettings> {
  return DataSettingsSchema.parse(await invoke<unknown>("update_data_settings", { settings }));
}

export async function getStorageStats(): Promise<StorageStats> {
  return StorageStatsSchema.parse(await invoke<unknown>("get_storage_stats"));
}

export async function previewDataCleanup(retentionDays: number): Promise<CleanupPreview> {
  return CleanupPreviewSchema.parse(
    await invoke<unknown>("preview_data_cleanup", { retentionDays }),
  );
}

export async function runDataCleanup(retentionDays: number): Promise<CleanupResult> {
  return CleanupResultSchema.parse(await invoke<unknown>("run_data_cleanup", { retentionDays }));
}

export function createDiagnosticBundle(): Promise<string> {
  return invoke<string>("create_diagnostic_bundle");
}

export async function getGlobalInsights(query: GlobalInsightsQuery = {}): Promise<GlobalInsights> {
  return GlobalInsightsSchema.parse(
    await invoke<unknown>("get_global_insights", {
      query: {
        source: query.source ?? null,
        workspace: query.workspace ?? null,
        from: query.from ?? null,
        to: query.to ?? null,
        bucket: query.bucket ?? null,
        projectLimit: query.projectLimit ?? null,
        rankingLimit: query.rankingLimit ?? null,
      },
    }),
  );
}
