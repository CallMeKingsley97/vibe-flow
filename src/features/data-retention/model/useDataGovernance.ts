import { useCallback, useEffect, useState } from "react";

import {
  createDiagnosticBundle,
  getDataSettings,
  getStorageStats,
  previewDataCleanup,
  runDataCleanup,
  updateDataSettings,
} from "../../../shared/api/capture";
import type {
  CleanupPreview,
  DataSettings,
  StorageStats,
  UpdateDataSettings,
} from "../../../shared/contracts/capture";
import { formatError } from "../../../shared/lib/error";

export function useDataGovernance() {
  const [settings, setSettings] = useState<DataSettings | null>(null);
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextSettings, nextStats] = await Promise.all([getDataSettings(), getStorageStats()]);
      setSettings(nextSettings);
      setStats(nextStats);
      setError(null);
    } catch (reason) {
      setError(formatError(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void refresh(), [refresh]);

  async function save(value: UpdateDataSettings) {
    setBusy(true);
    try {
      const next = await updateDataSettings(value);
      setSettings(next);
      setStats(await getStorageStats());
      setPreview(null);
      setError(null);
      return next;
    } catch (reason) {
      setError(formatError(reason));
      throw reason;
    } finally {
      setBusy(false);
    }
  }

  async function inspect(retentionDays: number) {
    setBusy(true);
    try {
      const value = await previewDataCleanup(retentionDays);
      setPreview(value);
      setError(null);
      return value;
    } catch (reason) {
      setError(formatError(reason));
      throw reason;
    } finally {
      setBusy(false);
    }
  }

  async function cleanup(retentionDays: number) {
    setBusy(true);
    try {
      const result = await runDataCleanup(retentionDays);
      setStats(await getStorageStats());
      setPreview(null);
      setError(null);
      return result;
    } catch (reason) {
      setError(formatError(reason));
      throw reason;
    } finally {
      setBusy(false);
    }
  }

  async function diagnose() {
    setBusy(true);
    try {
      const path = await createDiagnosticBundle();
      setError(null);
      return path;
    } catch (reason) {
      setError(formatError(reason));
      throw reason;
    } finally {
      setBusy(false);
    }
  }

  return { settings, stats, preview, loading, busy, error, save, inspect, cleanup, diagnose };
}
