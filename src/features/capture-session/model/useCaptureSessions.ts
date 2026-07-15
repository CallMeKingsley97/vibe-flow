import { useCallback, useEffect, useState } from "react";

import { listCaptureSessions } from "../../../shared/api/capture";
import type { CaptureSession } from "../../../shared/contracts/capture";
import { formatError } from "../../../shared/lib/error";

export function useCaptureSessions() {
  const [sessions, setSessions] = useState<CaptureSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSessions(await listCaptureSessions());
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
