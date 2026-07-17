import { useCallback, useEffect, useRef, useState } from "react";

import { listCaptureSessions } from "../../../shared/api/capture";
import type { CaptureSession } from "../../../shared/contracts/capture";
import { formatError } from "../../../shared/lib/error";

export function useCaptureSessions() {
  const [sessions, setSessions] = useState<CaptureSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const refresh = useCallback(async () => {
    // 首次加载显示 loading；后续静默刷新，避免列表闪烁
    if (!hasLoadedRef.current) {
      setLoading(true);
    }
    try {
      const next = await listCaptureSessions();
      setSessions(next);
      hasLoadedRef.current = true;
      setError(null);
    } catch (reason) {
      setError(formatError(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { sessions, loading, error, refresh };
}
