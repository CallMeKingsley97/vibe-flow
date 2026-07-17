import { useCallback, useEffect, useRef, useState } from "react";

import {
  getSourceScanStatuses,
  scanLocalHistory,
  subscribeHistoryChanges,
} from "../../../shared/api/capture";
import type { HistoryChange, SourceScanStatus } from "../../../shared/contracts/capture";
import { formatError } from "../../../shared/lib/error";

const HISTORY_CHANGE_DEBOUNCE_MS = 400;

export function useLocalHistory(
  onSessionsChanged: () => Promise<void>,
  selectedSessionId: string | null = null,
) {
  const [statuses, setStatuses] = useState<SourceScanStatus[]>([]);
  const [scanning, setScanning] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const selectedSessionIdRef = useRef(selectedSessionId);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSessionIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
  }, [selectedSessionId]);

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      setStatuses(await scanLocalHistory());
      await onSessionsChanged();
      setRevision((value) => value + 1);
      setError(null);
    } catch (reason) {
      setError(formatError(reason));
    } finally {
      setScanning(false);
    }
  }, [onSessionsChanged]);

  useEffect(() => {
    let active = true;

    function flushPendingChanges() {
      if (!active) return;
      const pending = pendingSessionIdsRef.current;
      pendingSessionIdsRef.current = new Set();
      void onSessionsChanged();
      const selected = selectedSessionIdRef.current;
      // 仅当当前选中会话变更，或尚无选中会话时刷新事件明细
      if (!selected || pending.has(selected) || pending.size === 0) {
        setRevision((value) => value + 1);
      }
    }

    function queueHistoryChange(change: HistoryChange) {
      pendingSessionIdsRef.current.add(change.sessionId);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(flushPendingChanges, HISTORY_CHANGE_DEBOUNCE_MS);
    }

    void subscribeHistoryChanges((change) => {
      if (!active) return;
      queueHistoryChange(change);
    }).catch((reason: unknown) => {
      if (active) setError(formatError(reason));
    });
    void getSourceScanStatuses().then((value) => {
      if (active) setStatuses(value);
    });
    void scan();

    return () => {
      active = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [onSessionsChanged, scan]);

  return { statuses, scanning, revision, error, scan };
}
